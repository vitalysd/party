# Текущий сервер — 26 октября 2026

Приложение: https://31-172-67-27.sslip.io (HTTPS 443). VPS: 31.172.67.27. Перенесены база и uploads: 4 пользователя, 13 сообщений, 6 файлов. Старый VPS 185.18.52.100: backend/livekit остановлены, Caddy перенаправляет старый адрес на новый; VPN не изменён. Старые данные сохранены для отката.

Резервные копии: старый сервер backups/20261026T062907Z, новый сервер backups/20261026T063335Z. На новом сервере ежедневный backup в 03:15 UTC. Windows-приложение пересобрано и установленная локальная версия обновлена; проверочный вход в native UI получил ожидаемый ответ API «Неверный логин или пароль», сетевого тайм-аута нет. HTTPS health и CORS из Windows проверены; LiveKit server API доступен. Реальный голос/демонстрация после миграции требуют пользовательской проверки.

Ниже — история предыдущих развёртываний.

# Развёртывание — 24 октября 2026

Приложение: https://185-18-52-100.sslip.io:9443

Новый сервер: 185.18.52.100. Пользователь выбрал пустую базу, сохранение VPN и технический адрес sslip.io. Старый VPS 138.124.80.26 не изменялся. Порты 443 и 8443 заняты существующими VPN, поэтому приложение использует 9443. Порт 80 обслуживает ACME HTTP challenge и перенаправление на HTTPS.

## Первый вход

В `artifacts/deployment/bootstrap-invite.txt` сохранена приватная ссылка на регистрацию первого администратора. Откройте её и задайте собственные логин и пароль. После первой регистрации bootstrap-код больше не подходит для создания пользователей; новые одноразовые приглашения создаются кнопкой «Пригласить». Не публикуйте первоначальную ссылку. Она также хранится на сервере в `/opt/pati/bootstrap-invite.txt` с доступом только root.

## Исправления

- Личные переписки привязаны к подтверждённому каналу выбранного собеседника; устаревший ответ не переключает десктопный DM. Мобильные ошибки не открывают общий канал.
- Голосовой аудиопроигрыватель сохраняется при переключении экранов, заглушение управляет входящими треками. Добавлено отображение демонстраций экрана. Убраны вымышленные показатели качества связи.
- Основные демонстрационные участники, последние сообщения и голосовые счётчики заменены фактическими данными или нейтральными состояниями.
- Создаются настоящие одноразовые приглашения; форма регистрации принимает код из ссылки.
- Очередь неподтверждённых сообщений сохраняется локально после перезагрузки, восстанавливается в состоянии ручного повтора и очищается при выходе. После подключения WebSocket запрашивается история активного канала.
- PostgreSQL advisory locks защищают регистрацию/расход инвайтов и создание DM от конкурентных запросов. PostgreSQL-тест подтвердил отсутствие дублей при повторной отправке.
- Первоначальный администратор требует приватного bootstrap-кода. Production-конфигурация отклоняет стандартный JWT-секрет, dev-ключ LiveKit, wildcard CORS и незащищённый URL LiveKit. Авторизация и приглашения ограничены по частоте запросов.
- Применена baseline-миграция Alembic; автоматическое создание схемы при запуске в deployment отключено. Будущие изменения схемы нужно оформлять отдельными явными миграциями.
- Сохранены предыдущие исправления доступа к каналам/файлам, идемпотентности, истории, мобильных форм и доступности.

## Проверки

- 20 frontend-тестов и 24 backend-теста проходят; production-сборка успешна.
- Отдельная PostgreSQL-база: конкурентная регистрация с одноразовым инвайтом, конкурентное создание DM, идемпотентная отправка, история, запрет чужих приватных файлов и голосовых токенов, очистка профиля. Результат: `artifacts/deployment/verify-postgres.log`.
- Браузер → реальный API → PostgreSQL через локальный SSH-туннель: вход, отправка, сохранение после перезагрузки, переключение адресата, входящее сообщение через WebSocket без обновления страницы. Рабочая база для этих проверок не использовалась.
- Два браузерных клиента подключились к публичному LiveKit v1.13.10 по WSS и передали синтетическое аудио через WebRTC: 6456 полученных байт, без предупреждений/ошибок. Микрофон не использовался. Результат: `artifacts/deployment/voice-verification.txt`.
- Публичный HTTPS и `/health` работают, неавторизованный доступ к `/api/v1/channels` возвращает 401.
- Дамп рабочей базы восстановлен в отдельную проверочную базу успешно.

## Эксплуатация

Каталог сервера: `/opt/pati`. Compose-файл: `/opt/pati/compose.yml`. Контейнеры имеют restart policy, лимиты памяти и ротацию Docker-логов. PostgreSQL и backend не публикуют свои порты наружу. LiveKit публикует TCP 7881 и UDP 50000–50050. Для сервера с 1 ГБ RAM добавлен swap 512 МБ; существующие VPN не перенастраивались.

Команды на сервере:

```sh
cd /opt/pati
docker compose -f compose.yml ps
curl -fsS https://185-18-52-100.sslip.io:9443/health
sh deploy/backup.sh
docker compose -f compose.yml logs --tail=100 backend
```

Резервные копии БД, файлов и конфигурации находятся в `/opt/pati/backups`. Первая копия БД: `20261024T113809Z`; финальная копия: `20261024T125357Z`. Конфигурация VPN сохранена отдельно в `vpn-config-before-pati-20261024.tar.gz`. Скрипт создаёт дамп и архив uploads с контрольными суммами. Восстановление требует остановки записей и выбранной целевой БД; не запускайте восстановление поверх работающей базы без отдельной копии.

После проверки остановлен и удалён `pati-verify-api`, удалены только созданные тестовые БД `pati_verify` и `pati_restore_check`, закрыт локальный SSH-туннель. Рабочая БД содержит 0 пользователей перед передачей первоначального приглашения. Последняя проверка ресурсов: 1,8 ГБ свободного диска, около 539 МБ доступной RAM, используются 287 МБ swap.

Фактические версии Python-пакетов: `artifacts/deployment/requirements.deployed.txt`. LiveKit закреплён на v1.13.10. Сборочный архив `artifacts/pati-final-20261024.tar.gz` имеет SHA256 `6A8D92FB326F4D4CC47B05B63A91EFAD2C4B5E1AFA59E065381BF07247F21CDE`; финальная версия LiveKit задана отдельно в compose после загрузки архива.

## Ограничения

Это проверенный небольшой deployment, не гарантия отсутствия всех ошибок. Ресурсы VPS ограничены: 1 ГБ RAM и около 2 ГБ свободного диска после установки. Нагрузочное тестирование не выполнялось. Backend использует один worker; для масштабирования нужен общий транспорт событий и распределённый rate limiter.

Живые микрофоны, устройства пользователей, Safari/iOS, демонстрация экрана между устройствами и сети, которым требуется TURN, отдельно не проверены. TURN не настроен. Синтетический тест подтверждает сетевую передачу аудио в проверенной сети, но не качество пользовательских микрофонов.

Резервные копии пока выполняются вручную и хранятся на том же сервере; для длительной эксплуатации нужны расписание, контроль места и отдельное хранилище. Пакет JS остаётся около 958 КБ до gzip. Часть второстепенных элементов исходного макета (поиск/меню/создание каналов), полноценный учёт прочитанного и серверная синхронизация истории всех неактивных чатов требуют отдельной доработки.

Настройка HTTPS сверена с [документацией Caddy](https://caddyserver.com/docs/automatic-https), версия голосового сервера — с [релизом LiveKit v1.13.10](https://github.com/livekit/livekit/releases/tag/v1.13.10).

## Обновление комнат — 24 октября 2026

- Левая колонка: поиск, сворачиваемые «Друзья», затем «КОМНАТЫ» без личных чатов.
- Создание текстовых/голосовых комнат, выбор из восьми иконок; изменение иконки и удаление доступны владельцу и администратору. Удаление требует подтверждения.
- API PATCH/DELETE /api/v1/channels/{id}, проверки прав, ограничения названия. Изменения списка распространяются через WebSocket; после удаления активной комнаты выбирается оставшаяся.
- Миграция 20261024_tea_room однократно добавляет «Чайхана». Автоматическое восстановление стартовых комнат при каждом запуске удалено, чтобы удалённые комнаты не возвращались.
- Резервная копия до релиза: /opt/pati/backups/20261024T140011Z.
- Проверки: 26 backend tests, 20 frontend tests, TypeScript/Vite production build; браузер — сворачивание, поиск, создание и смена иконки, подтверждение удаления. На сервере проверены PostgreSQL create/update/delete с сообщениями и метаданными вложений, LiveKit delete; проверочная транзакция полностью откачена.
- Удаление комнаты удаляет записи доступа к её вложениям; физические файлы пока остаются на диске для отдельной очистки. Резервные копии сохраняются.
- Скриншот artifacts/rooms-sidebar.png снят на локальных тестовых данных.

## Голос внутри комнаты — 25 октября 2026

- В настольной комнате убраны верхняя панель с названием/поиском/кнопкой голоса, баннер подключения и разделитель над перепиской.
- Под участниками расположен сворачиваемый блок «ГОЛОС»: подключение именно к открытому channel_id, участники с индикацией речи, микрофон, звук, демонстрация экрана и выход. Ошибки подключения отображаются в блоке.
- Настольные переходы к голосу теперь открывают переписку с этим блоком, без отдельного VoiceRoomView. Просмотр другой комнаты не прерывает существующий разговор; для смены разговора показано пояснение. Мобильный отдельный экран этим изменением не перерабатывался.
- Проверены production build, 20 frontend tests, браузерные сценарии на локальной fixture: сворачивание, управление микрофоном, переход между комнатами и возврат к текущему разговору, ширина 900px без горизонтального переполнения. Настоящий разговор двух клиентов в этом релизе повторно не запускался.
- Скриншот artifacts/room-inline-voice.png использует тестовых участников без доступа к микрофону.
- Предыдущая сборка: /opt/pati/backups/frontend-before-inline-voice-20261025.tar.gz. Только frontend deployment, backend/VPN не перезапускаются.

### Уточнение правой колонки — 25 октября 2026
- Ширина: 320px на больших экранах (вместо 256px), 288px от 1024px; на узких экранах сохранено 224px.
- Удалён блок «Со своими веселее» с кнопкой приглашения из правой колонки комнаты.
- Production build прошёл. Предыдущая сборка: /opt/pati/backups/frontend-before-wider-panel-20261025.tar.gz.

Голосовая панель 25.10.2026: убрано сворачивание; управление подключённым разговором закреплено внизу правой колонки, списки прокручиваются отдельно. Production build и браузерная проверка пройдены (нижний отступ кнопок 16px). Резервная сборка: /opt/pati/backups/frontend-before-fixed-voice-20261025.tar.gz.

25.10.2026: из нижнего блока Sidebar удалены кнопки микрофона и звука; настройки перенесены от логотипа к кнопке выхода. Production build прошёл. Резервная сборка: /opt/pati/backups/frontend-before-profile-controls-20261025.tar.gz.

## Индивидуальная громкость — 25 октября 2026
- Ползунок 0–100% для каждого удалённого участника в правой голосовой панели и мобильной VoiceCard. Собственный микрофон этим ползунком не регулируется.
- LiveKit RemoteParticipant.setVolume применяется локально к Microphone и ScreenShareAudio; значения восстанавливаются при подключении участника и сохраняются SDK для новых публикаций треков.
- Настройки localStorage раздельны по слушателю, сохраняются между комнатами и перезагрузками. При смене аккаунта загружаются его собственные значения. Общий deafen по-прежнему блокирует все аудиотреки.
- Проверено: 22 frontend tests, production build; браузерная fixture — изменение до 0%, клавиатурное управление, восстановление после перезагрузки. Вызовы SDK, независимость участников и изоляция аккаунтов покрыты тестами. Реальный разговор двух клиентов в этом релизе повторно не запускался.
- Снимок artifacts/participant-volume.png использует тестовые данные. Резервная сборка: /opt/pati/backups/frontend-before-participant-volume-20261025.tar.gz.

## Единая цветовая палитра — 25 октября 2026

- В 21 исходном файле заменены 448 вхождений HEX/RGB-цветов на семантические CSS-переменные из frontend/src/index.css. Обновлены авторизация, настройки, комнаты, друзья, сообщения, аватары и голосовые компоненты.
- Оттенки рамок/поверхностей/подписей сведены к общей палитре; цвета состояний и акцента используют токены pati. Свечение, radial gradient, scrollbar и voice-ripple также используют переменные.
- Добавлены frontend/COLORS.md и npm run check:colors. Аудит включён в npm run build и запрещает цветовые литералы вне @theme.
- Проверены 22 теста фронтенда, аудит цветов, TypeScript/Vite build, наличие всех используемых токенов и классов эффектов в итоговом CSS. Визуальная проверка в текущей сессии недоступна: инструмент браузера не предоставил доступных браузеров.
- Резервная сборка на VPS: /opt/pati/backups/frontend-before-theme-colors-20261025.tar.gz.
- Локальный исходный снимок и отчёт замен: artifacts/color-audit/.

## Личные сообщения — 26 октября 2026

- Правая колонка с участниками и RoomVoicePanel рендерится только у обычных комнат; у is_direct переписка занимает всю доступную ширину. В compact-виде правая колонка также не монтируется.
- Пустой чат на desktop/mobile и в FriendsView использует фразу «Напишите первое сообщение или скиньте мем.». В ChatView/MobileChatView удалены приветствие и вступление про историю канала.
- Активный личный звонок имеет компактную строку микрофона/завершения; открытие переписки само по себе не показывает эту строку и не начинает звонок.
- Проверки: 22 frontend tests, check:colors, production build; браузерная fixture — открытие друга без участников/голосовой панели, сохранение панели в обычной комнате, пустая подсказка, завершение активного личного звонка. Ошибок в консоли не обнаружено.
- Скриншот artifacts/direct-messages-empty.png снят на локальных тестовых данных.
- Резервная сборка: /opt/pati/backups/frontend-before-direct-messages-20261026.tar.gz.

### Подсветка навигации и пустой чат — 26 октября 2026
- Выбранные друг и комната в Sidebar имеют акцентный фон/обводку и aria-current="page". Личный собеседник определяется по user_id в составе DM, а не по имени; при смене переписки подсветка переносится на текущий пункт.
- В ChatView и MobileChatView возвращена декоративная иконка Gamepad2 над фразой «Напишите первое сообщение или скиньте мем.».
- Проверены production build, check:colors и браузерное переключение друг → комната: один активный пункт, предыдущая подсветка снимается. Снимки на тестовых данных: artifacts/selected-friend-gamepad.png и artifacts/selected-room-gamepad.png.
- Предыдущая сборка: /opt/pati/backups/frontend-before-selection-20261026.tar.gz.

26.10.2026: в ChatView для is_direct подсказка поля — «Написать имя», для комнат — «Написать в название». Мобильный экран уже использовал нужную формулировку. Production build и check:colors прошли. Предыдущая сборка: /opt/pati/backups/frontend-before-dm-placeholder-20261026.tar.gz.

## Единый список друзей и личный чат — 26 октября 2026

- Отдельный Desktop FriendsView удалён. Его карточки друзей с аватаром, активностью, кнопкой переписки и фильтрами «Все / В сети» перенесены в FriendsList внутри основного Sidebar. Сохранено сворачивание списка и поиск по друзьям/комнатам, добавление друга выполняется через копирование приглашения.
- Левый столбец 288px/320px на больших экранах; комнаты идут под списком друзей. Настройки и выход остаются внизу.
- ChatView для личных сообщений получил шапку с актуальными аватаром/статусом собеседника и кнопкой звонка, а также вводный блок с большим аватаром для существующей переписки. В пустом чате сохранены геймпад и короткая подсказка; участники комнаты/RoomVoicePanel в DM не появляются.
- Поздний ответ openDM не меняет выбор после перехода в другую комнату или смены аккаунта. Исправлены совпадающие ключи шапки DM и ChatInput, из-за которых React мог сохранять предыдущую шапку при переходах.
- Проверки: 22 frontend tests, check:colors, production build; браузерная fixture — фильтр online/offline, поиск, смена двух собеседников, возврат в комнату, задержанный ответ DM, пустое состояние и ширина 900px без горизонтального переполнения. После исправления ключей новых ошибок консоли нет. Реальный звонок в этом релизе повторно не проверялся.
- Скриншот artifacts/unified-friends-and-dm.png использует тестовые данные.
- Резервная сборка VPS: /opt/pati/backups/frontend-before-unified-friends-20261026.tar.gz. Локальный снимок исходников: artifacts/frontend-before-unified-friends-20261026.tar.gz.

## Исправления по ревью — 26 октября 2026

Закрыты семь основных пунктов artifacts/review/CODE_REVIEW-20261026.md:

- toggleDeafen подтверждает выключение микрофона до изменения UI; ошибка оставляет реальное состояние. Запоздалая демонстрация экрана не меняет новую комнату, поздно опубликованный старый трек выключается.
- Удаление текстовых и голосовых комнат вызывает LiveKit DeleteRoom; клиент завершает соединение при исчезновении канала. Физические вложения удаляются после подтверждённого удаления комнаты.
- NEW_MESSAGE/MESSAGE_UPDATED для DM доставляются всем участникам/их устройствам, а не только подписчикам открытого канала. Добавлен локальный счётчик непрочитанных, сбрасываемый при открытии диалога. Новые пользователи обновляются событием USERS_CHANGED.
- /api/v1/calls: старт, текущее состояние, принятие, завершение; адресные CALL_CHANGED, 30-секундное ожидание, проверка участников, офлайна и занятости. Для получения токена DM требуется принятый звонок, LiveKit-комната уникальна на каждый вызов. Только инициировавшая/принявшая вкладка включает микрофон; другие устройства получают состояние без автоматического подключения. Отключение последнего WebSocket завершает звонок.
- Сервер валидирует непустые логин/имя, длины профиля, enum статуса и пароль от 8 символов до 72 UTF-8 байт. Существующие пароли проверяются как прежде. Аватар при регистрации проходит ту же проверку доступа, что и при редактировании.
- Хранилище: файл до 25MB, пользователь до 200MB, все uploads до 512MB, резерв свободного диска 256MB. Настраивается MAX_USER_UPLOAD_BYTES, MAX_STORAGE_UPLOAD_BYTES, MIN_UPLOAD_FREE_BYTES. Квоты сериализованы PostgreSQL advisory-lock.
- Миграция 20261026_upload_retention добавляет created_at и датирует существующие записи временем миграции. Ежечасная очистка удаляет только неиспользуемые загрузки старше 24 часов (ORPHAN_UPLOAD_HOURS), сохраняя вложения сообщений и актуальные аватары; свежие загрузки не трогает. Неизвестные legacy-файлы старого формата автоматически не удаляются.

Проверки: 26 frontend tests + 34 backend tests (60 всего), TypeScript/Vite build и check:colors; браузер — входящий звонок/отклонение, исходящий/отмена, unread badge. Изолированный PostgreSQL pati_fixes_verify: миграция старой структуры таблицы, доставка DM вне активного канала, согласие на звонок, запрет постороннего, токен после принятия, LiveKit close, квоты, сохранение используемого файла и удаление сироты, удаление текстовой комнаты/файла, 422 на плохие поля. В этой проверке WebSocket-клиенты заменены сокетами-заглушками, реальная передача звука двух браузеров повторно не запускалась.

Ограничение: сигнализация звонков, как существующий ConnectionManager, хранится в памяти одного backend worker; перед горизонтальным масштабированием нужен общий брокер/хранилище. Перезапуск backend завершает текущие личные вызовы.

Резервная копия БД/uploads/config до обновления: /opt/pati/backups/20261025T211353Z. Предыдущий frontend: /opt/pati/backups/frontend-before-review-fixes-20261026.tar.gz. ID предыдущего backend image: /opt/pati/backups/backend-image-before-review-fixes.txt. Интеграционный лог: /opt/pati/verify-fixes.log. Скриншот тестового входящего звонка: artifacts/incoming-call-fixed.png.

Дополнительная проверка релиза: frontend/tests/voice-network.ts обновлён под новый протокол звонка. Два WebRTC-клиента в браузере через локальный SSH-туннель к отдельному API получили приглашение через настоящий WebSocket, приняли звонок, передали 6175 байт аудио через публичный LiveKit, применили громкость 25% и оба отключились по серверному завершению. Синтетический источник, физический микрофон/динамики не использовались. Результат: artifacts/review/rtc-fixes-verification.txt. Тестовый API и БД после проверки удалены.

Также добавлено маскирование token= в логах uvicorn.error/uvicorn.access; проверено отдельным тестом и двумя настоящими WebSocket-подключениями тестового API (2 замаскированные записи). Итог: 26 frontend + 35 backend = 61 тест. Backend дополнительно пересобран с фильтром логов и обновлён.

## 2026-10-26 — Screen share inside chat
ScreenShares now occupies the upper half of the chat message area (desktop and mobile); messages scroll below, composer remains visible. Removed duplicate video from room voice sidebar. Multiple screens have selectable tabs; no tracks restores full chat height. Scoped to the connected channel. Verified with real LiveKit VideoTrack using a synthetic 1280x720 canvas track: 314.5px of 629px content, video readyState 4, stop removes video. Screenshot: artifacts/screen-share-chat.png. Build/color audit and 26 frontend tests passed. Frontend release assets: index-DgVtz-b9.js, index-s8YqoNdi.css. Server backup: backups/frontend-before-screen-layout-20261026.tar.gz.

2026-10-26: Increased chat screen-share area from 50% to 70% (desktop/mobile shared component). Build and color audit passed. Deployed index-Ck3aq-pB.js / index-BZcjcfih.css. Backup: backups/frontend-before-screen-70-20261026.tar.gz.

2026-10-26: Removed presence indicator from desktop message avatars (MessageItem); mobile message avatars already omit status. Build and color audit passed. Frontend: index-Cd4v3I8X.js. Backup: backups/frontend-before-message-avatar-20261026.tar.gz.

2026-10-26: Removed bottom-left voice banner/button from Sidebar and unused voice store subscription/icons. Build/color audit passed. Release index-IIDa1ok4.js / index-Cu0tMHP9.css. Backup: backups/frontend-before-sidebar-voice-remove-20261026.tar.gz.

2026-10-26: Voice panel always expanded with participant preview before joining, polled every 5s while disconnected. Join/cancel button pinned to bottom, connected controls unchanged. Authenticated room-only LiveKit participants endpoint with channel access enforcement, 4s timeout, missing room returns empty. 26 frontend + 38 backend tests passed; browser fixture screenshot artifacts/voice-before-join.png. Deployed frontend index-CYQ5Co2K.js, backend rebuilt. Backup: backups/before-voice-preview-20261026.tar.gz.

2026-10-26: Moved add-friend invitation action from FriendsList header to Sidebar bottom bar replacing settings icon; profile/avatar is now an accessible button opening settings. Retained copy confirmation/error feedback. Build/color audit passed. Frontend index-CjAKHapI.js. Backup: backups/frontend-before-invite-bottom-20261026.tar.gz.

2026-10-26: Invitation copy success message and check icon reset after 1000ms; timer cleaned up on unmount/state change. Build/color audit passed. Frontend index-BoHwQkr-.js. Backup: backups/frontend-before-invite-timeout-20261026.tar.gz.

2026-10-26: Explicit left text alignment on Sidebar profile button fixes centered status after div-to-button accessibility change. Build/color audit passed. Frontend index-B9tD4bNv.js. Backup: backups/frontend-before-profile-align-20261026.tar.gz.

2026-10-26: Added shared base cursor pointer rules for buttons, links, summaries, labels and interactive form/ARIA controls; disabled controls use not-allowed. Text entry retains text cursor. Build/color audit passed. Frontend index-DMM1QDfB.js / index-CCbb1S_U.css. Backup: backups/frontend-before-cursors-20261026.tar.gz.

2026-10-26: Added gentle Web Audio sine notifications (voice connect/disconnect and current-room participant changes, background unread messages, incoming calls every 4.5s while ringing). Sound settings: enable, persisted volume default 25%, four previews. Audio unlocks on user interaction; no external assets. Build/color audit and 26 tests passed; browser settings/preview no console errors. Screenshot artifacts/sound-settings.png. Frontend index-BU6QCoa1.js. Backup: backups/frontend-before-soft-sounds-20261026.tar.gz.

2026-10-26: Removed explanatory sounds caption; removed square ring/shadow around profile avatar and constrained circular change-photo overlay to 96px. Build/color audit passed. Frontend index-C0q31WNX.js / index-DV2mSLk5.css. Backup: backups/frontend-before-settings-clean-20261026.tar.gz.

2026-10-26: Added memory history cache (60s freshness, coalesced ensureMessages requests, empty chats cached), cached DM lookup, reconnect invalidation and auth reset. Preserves older pages on latest-page refresh. Desktop/mobile chat scroll restores each conversation's reading position and only follows new messages near bottom. 29 frontend tests/build/color audit passed; browser room-to-DM-to-room restored exact scrollTop 1322. Screenshot artifacts/chat-cache-scroll.png. Frontend index-DRsDZU-C.js. Backup: backups/frontend-before-chat-cache-20261026.tar.gz.
Cached conversations retain WebSocket subscriptions on navigation and resubscribe on reconnect so public-room cache stays live. Final asset index-01AYxpcZ.js; 29 tests passed again.

2026-10-26: Shared protected image object-URL cache for avatars/attachments, immediate URL reuse on remount, coalesced fetches, LRU target 128 entries/64MiB (active images retained), auth-change abort/revoke/clear. Failed requests retry. 31 frontend tests and build/color audit passed. Frontend index-BdHx6ydE.js. Backup: backups/frontend-before-image-cache-20261026.tar.gz.

2026-10-26: Built first Tauri Windows x64 NSIS installer (2.83MiB), tray hide/reopen/exit, single-instance, native notifications for background messages/calls and activation navigation, notification settings/test, desktop server URLs and public invites. Source build.rs/icons/Cargo.lock supplied. Server CORS permits only explicit Tauri origins; .env backup backups/env-before-desktop-20261026 retained server-side. Frontend build/color audit +31 tests passed; native login window and tray hide/reopen verified. Native end-to-end login, microphone, screen capture, installed notification delivery remain unverified: local TCP9443 timed out from app/curl/browser while server-local health and CORS preflight returned 200. Added 15s login/register timeouts. Installer artifacts/pati-1.0.0-windows-x64-setup.exe with SHA256. Browser production dist not changed in this release.

2026-10-26: Signed Tauri updater enabled (HTTPS /updates/latest.json, immutable per-version installers, atomic publication). Update button next to invite in Sidebar and on login screen. Dialog shows current/new versions, notes, progress and blocks install while connected/connecting to voice. Local signing key .build-tools/signing/pati.key is ACL restricted and ignored; only public key committed, no private key on server. Build/release scripts: frontend/scripts/build-windows.ps1, deploy/publish-update.py. Native UI end-to-end verified 1.1.1 -> 1.1.2 via check/download/install button; auto-relaunch and account preserved. Installed exe ProductVersion 1.1.2. Public installer downloaded and SHA256 equals local release. Frontend 31 tests/build/color audit passed. First-time bootstrap for versions before 1.1.0 remains manual. Public release https://31-172-67-27.sslip.io/updates/1.1.2/pati_1.1.2_x64-setup.exe.

2026-10-27: Invite action now copies only the generated one-use invite code, without URL; confirmations updated in Sidebar/mobile/voice views and existing 1s reset retained. Web deployed index--jiqxVoC.js; backup backups/frontend-before-invite-code-20261027.tar.gz. Signed Windows release 1.1.3 prepared for updater. Build/color audit and 31 tests passed.

2026-10-27: Windows release 1.1.4 adds persistent DPAPI-encrypted session storage (session-v1.bin in per-app local data), fsync + atomic replacement, serialized writes and explicit logout tombstone. Existing WebView login migrates on first start; startup waits for restoration; browser storage errors handled. Authentication generation prevents late restore undoing logout/sign-in; server token validation/30-day lifetime unchanged. 37 frontend tests and 2 native Windows crypto/disk persistence tests passed, signed build/color audit passed. Web index-81xS_ST2.js deployed; backup backups/frontend-before-session-persistence-20261027.tar.gz. Updater release 1.1.4 published.

2026-10-28: Release 1.1.5 refactors login/registration into one typed flow with request ownership, response validation and consistent timeout handling. Late authentication cannot undo logout or overwrite a newer attempt. Native session hydration/token refresh restores the per-account outbox. Chat history loading indicators are scoped to the active chat; stale uploads/socket callbacks/DM navigation cannot affect newer sessions or selections. Root App and ChatInput use shallow selectors to avoid unrelated store renders; composer cleans typing timers, respects IME input and blocks sending during uploads. CORS wraps the rate limiter so desktop clients can read 429 responses. Regression coverage: 45 frontend tests, 39 backend tests; TypeScript, color audit and signed Windows build passed. Backup: backups/before-refactor-1.1.5-20261028.tar.gz; rollback backend image pati-backend:before-1.1.5. Frontend asset index-Bu30IiKp.js. Native installation/restart and visual interaction checks were not repeated for this release. Vite still reports a >500kB main bundle; further code splitting remains a performance improvement, not a failed build.
