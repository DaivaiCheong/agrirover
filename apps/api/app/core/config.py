from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All configuration comes from the environment. Nothing is hard-coded."""
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://aaf:aaf@localhost:5432/aiautofarm"

    jwt_secret_key: str = "dev-only-change-me"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 30
    refresh_token_days: int = 7

    mqtt_host: str = "localhost"
    mqtt_port: int = 1883
    mqtt_username: str | None = None
    mqtt_password: str | None = None
    mqtt_tls: bool = False

    # Both spellings of the dev host: a browser opened at 127.0.0.1 sends a
    # different Origin than one opened at localhost, and CORS treats them as
    # different sites. Allowing only one produces a silent preflight failure.
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    weather_api_url: str | None = None
    weather_api_key: str | None = None

    # Photo check. A local Ollama: photos stay on the farm's machine. No model named means the check is off.
    ollama_url: str = "http://localhost:11434"
    ollama_model: str | None = None

    # Stage 1 runs one farm; the topic segment farm/{name}/... must match it.
    farm_name: str = "farm-01"

    # Daily Telegram message. Both must be set, or the worker stays off.
    telegram_bot_token: str | None = None
    telegram_chat_id: str | None = None
    daily_message_time: str = "06:05"          # farm-local HH:MM

    admin_email: str = "admin@aiautofarm.local"
    admin_password: str = "change-me"


settings = Settings()
