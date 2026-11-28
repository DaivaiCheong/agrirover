from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All configuration comes from the environment. Nothing is hard-coded."""
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    mongodb_url: str = "mongodb://localhost:27017"
    mongodb_db: str = "agrirover"

    jwt_secret_key: str = "dev-only-change-me"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 30
    refresh_token_days: int = 7

    mqtt_host: str = "localhost"
    mqtt_port: int = 1883
    mqtt_username: str | None = None
    mqtt_password: str | None = None
    mqtt_tls: bool = False

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    weather_api_url: str | None = None
    weather_api_key: str | None = None

    ollama_url: str = "http://localhost:11434"
    ollama_model: str | None = None
    ollama_api_key: str | None = None
    photo_matches: bool = False
    photo_dir: str = "farm-photos"
    # a simulated round's camera draws coloured squares: checking those wastes the model, unless a test asks for it
    check_simulated_photos: bool = False
    # the ESP32-CAM's photo URL, when it has not reported one itself over MQTT (Rover › Test)
    rover_camera_url: str | None = None

    farm_name: str = "farm-01"

    telegram_bot_token: str | None = None
    telegram_chat_id: str | None = None
    daily_message_time: str = "06:05"
    rover_round_time: str = "07:00"

    admin_email: str = "admin@agrirover.local"
    admin_password: str = "change-me"


settings = Settings()
