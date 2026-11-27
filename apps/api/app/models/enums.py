from enum import Enum


class Metric(str, Enum):
    soil_moisture = "soil_moisture"
    soil_ph = "soil_ph"
    soil_ec = "soil_ec"
    soil_temperature = "soil_temperature"
    nitrogen = "nitrogen"
    phosphorus = "phosphorus"
    potassium = "potassium"
    air_temperature = "air_temperature"
    air_humidity = "air_humidity"
    water_ph = "water_ph"
    rain = "rain"
    supply_voltage = "supply_voltage"


class Quality(str, Enum):
    valid = "valid"
    good = "good"
    suspect = "suspect"
    bad = "bad"
