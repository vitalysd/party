from pydantic import BaseModel


class LiveKitTokenRequest(BaseModel):
    channel_id: str


class LiveKitTokenResponse(BaseModel):
    token: str
    server_url: str
