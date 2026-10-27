use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::ErrorKind,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{AppHandle, Manager, State};

#[derive(Serialize, Deserialize)]
pub struct SavedSession {
    token: String,
    user: serde_json::Value,
}

#[derive(Serialize)]
pub struct StoredSession {
    present: bool,
    session: Option<SavedSession>,
}

#[derive(Default)]
pub struct SessionLock(pub Mutex<()>);

fn session_path(app: &AppHandle) -> Result<PathBuf, String> {
    let folder = app
        .path()
        .app_local_data_dir()
        .map_err(|_| "Session directory unavailable")?;
    fs::create_dir_all(&folder).map_err(|_| "Cannot create session directory")?;
    Ok(folder.join("session-v1.bin"))
}

#[cfg(windows)]
fn protect(data: &[u8], encrypt: bool) -> Result<Vec<u8>, String> {
    use windows_sys::Win32::{
        Foundation::LocalFree,
        Security::Cryptography::{
            CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
        },
    };
    let input = CRYPT_INTEGER_BLOB {
        cbData: data.len().try_into().map_err(|_| "Session too large")?,
        pbData: data.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };
    // DPAPI scopes encryption to the current Windows account, not the whole machine.
    unsafe {
        let success = if encrypt {
            CryptProtectData(
                &input,
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        } else {
            CryptUnprotectData(
                &input,
                std::ptr::null_mut(),
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        };
        if success == 0 {
            return Err("Windows session protection failed".into());
        }
        let result = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        LocalFree(output.pbData as _);
        Ok(result)
    }
}

#[cfg(not(windows))]
fn protect(_: &[u8], _: bool) -> Result<Vec<u8>, String> {
    Err("Native session storage is supported on Windows".into())
}

#[tauri::command]
pub fn save_session(
    app: AppHandle,
    lock: State<SessionLock>,
    session: Option<SavedSession>,
) -> Result<(), String> {
    let _guard = lock.0.lock().map_err(|_| "Session storage busy")?;
    let path = session_path(&app)?;
    write_saved_session(&path, &session)
}

fn write_saved_session(path: &Path, session: &Option<SavedSession>) -> Result<(), String> {
    if let Some(session) = session {
        if session.token.is_empty()
            || session.token.len() > 16384
            || !session.user["id"].is_string()
        {
            return Err("Invalid session".into());
        }
    }
    let data = serde_json::to_vec(&session).map_err(|_| "Cannot serialize session")?;
    if data.len() > 262144 {
        return Err("Session too large".into());
    }
    let encrypted = protect(&data, true)?;
    let temporary = path.with_extension("tmp");
    // Sync before the atomic replacement so a normal quit cannot lose the saved login.
    use std::io::Write;
    let mut file = fs::File::create(&temporary).map_err(|_| "Cannot save session")?;
    file.write_all(&encrypted)
        .and_then(|_| file.sync_all())
        .map_err(|_| "Cannot save session")?;
    drop(file);
    fs::rename(&temporary, path).map_err(|_| "Cannot replace session")?;
    Ok(())
}

#[tauri::command]
pub fn load_session(app: AppHandle, lock: State<SessionLock>) -> Result<StoredSession, String> {
    let _guard = lock.0.lock().map_err(|_| "Session storage busy")?;
    let path = session_path(&app)?;
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == ErrorKind::NotFound => {
            return Ok(StoredSession {
                present: false,
                session: None,
            })
        }
        Err(_) => return Err("Cannot read saved session".into()),
    };
    if bytes.len() > 524288 {
        return Err("Invalid saved session".into());
    }
    let plaintext = protect(&bytes, false)?;
    let session = serde_json::from_slice(&plaintext).map_err(|_| "Invalid saved session")?;
    Ok(StoredSession {
        present: true,
        session,
    })
}

#[cfg(all(test, windows))]
mod tests {
    use super::{protect, write_saved_session, SavedSession};
    #[test]
    fn dpapi_roundtrip_and_tamper_rejection() {
        let plaintext = b"test session - no real credentials";
        let mut encrypted = protect(plaintext, true).unwrap();
        assert_ne!(encrypted, plaintext);
        assert_eq!(protect(&encrypted, false).unwrap(), plaintext);
        let last = encrypted.len() - 1;
        encrypted[last] ^= 0xff;
        assert!(protect(&encrypted, false).is_err());
    }

    #[test]
    fn saved_login_survives_disk_reload_and_logout_replaces_it() {
        let path =
            std::env::temp_dir().join(format!("pati-session-test-{}.bin", std::process::id()));
        let session = Some(SavedSession {
            token: "test-token".into(),
            user: serde_json::json!({"id":"test-user"}),
        });
        write_saved_session(&path, &session).unwrap();
        let bytes = std::fs::read(&path).unwrap();
        assert!(!bytes.windows(10).any(|window| window == b"test-token"));
        let restored: Option<SavedSession> =
            serde_json::from_slice(&protect(&bytes, false).unwrap()).unwrap();
        assert_eq!(restored.unwrap().token, "test-token");
        write_saved_session(&path, &None).unwrap();
        let cleared: Option<SavedSession> =
            serde_json::from_slice(&protect(&std::fs::read(&path).unwrap(), false).unwrap())
                .unwrap();
        assert!(cleared.is_none());
        std::fs::remove_file(path).unwrap();
    }
}
