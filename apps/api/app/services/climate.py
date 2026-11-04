"""Siem Reap weather, and FAO-56 Penman-Monteith reference evapotranspiration (ET0).

ET0 is the water (mm per day) that a well-watered grass surface loses to the air. It changes with
the season, so a crop planted in November needs less water than the same crop planted in March.

The monthly numbers below were made with `et0_fao56()` from NASA POWER daily weather for
13.36 N, 103.86 E (36.9 m), 1 January 2015 to 31 December 2024, then averaged by calendar month.
Run `python -m app.services.climate` to make them again. They describe an average year: a very hot
or very wet month will differ. Rain is not part of ET0.

`et0_fao56` is checked against FAO-56 worked Example 18 in tests/test_climate.py.
"""
from __future__ import annotations

import math
from datetime import date, timedelta

LAT, LON, ELEV_M = 13.36, 103.86, 36.86
PLACE = "Siem Reap (13.36 N, 103.86 E)"
SOURCE = ("NASA POWER daily weather, 2015-2024, for 13.36 N 103.86 E; ET0 by the FAO-56 Penman-Monteith "
          "equation (Allen et al. 1998), averaged by calendar month. An average year, not a forecast.")

# month number -> value
ET0_MM_DAY = {1: 4.47, 2: 5.12, 3: 5.34, 4: 5.44, 5: 4.85, 6: 4.56,
              7: 4.07, 8: 4.16, 9: 3.70, 10: 3.65, 11: 3.83, 12: 4.18}
TMAX_C = {1: 34.2, 2: 35.9, 3: 37.3, 4: 36.8, 5: 34.8, 6: 32.6,
          7: 31.3, 8: 31.5, 9: 31.0, 10: 31.4, 11: 32.5, 12: 33.0}      # mean of the daily highs
RAIN_MM_DAY = {1: 0.36, 2: 0.61, 3: 1.27, 4: 2.15, 5: 4.03, 6: 5.27,
               7: 5.51, 8: 5.67, 9: 7.80, 10: 4.71, 11: 1.09, 12: 0.21}


def et0_on(day: date) -> float:
    return ET0_MM_DAY[day.month]


def et0_series(start: date, days: int) -> list[float]:
    """ET0 for each of `days` days beginning on `start`."""
    return [et0_on(start + timedelta(days=i)) for i in range(days)]


# ------------------------------------------------------------ FAO-56 Penman-Monteith

def es_kpa(t_c: float) -> float:
    """Saturation vapour pressure at air temperature t_c (FAO-56 eq. 11)."""
    return 0.6108 * math.exp(17.27 * t_c / (t_c + 237.3))


def ra_mj(lat_deg: float, doy: int) -> float:
    """Extraterrestrial radiation, MJ per m2 per day (FAO-56 eq. 21)."""
    phi = math.radians(lat_deg)
    dr = 1 + 0.033 * math.cos(2 * math.pi * doy / 365)
    delta = 0.409 * math.sin(2 * math.pi * doy / 365 - 1.39)
    ws = math.acos(max(-1.0, min(1.0, -math.tan(phi) * math.tan(delta))))
    return (24 * 60 / math.pi) * 0.0820 * dr * (
        ws * math.sin(phi) * math.sin(delta) + math.cos(phi) * math.cos(delta) * math.sin(ws))


def et0_fao56(tmax_c: float, tmin_c: float, ea_kpa: float, u2_ms: float, rs_mj: float,
              lat_deg: float, elev_m: float, doy: int) -> float:
    """Reference evapotranspiration, mm per day (FAO-56 eq. 6, daily step, soil heat flux 0).

    ea_kpa: actual vapour pressure; u2_ms: wind speed at 2 m; rs_mj: solar radiation, MJ per m2 per day.
    """
    tmean = (tmax_c + tmin_c) / 2
    pressure = 101.3 * ((293 - 0.0065 * elev_m) / 293) ** 5.26
    gamma = 0.000665 * pressure
    delta = 4098 * es_kpa(tmean) / (tmean + 237.3) ** 2
    es = (es_kpa(tmax_c) + es_kpa(tmin_c)) / 2
    rso = (0.75 + 2e-5 * elev_m) * ra_mj(lat_deg, doy)
    rns = 0.77 * rs_mj
    rnl = (4.903e-9 * ((tmax_c + 273.16) ** 4 + (tmin_c + 273.16) ** 4) / 2
           * (0.34 - 0.14 * math.sqrt(ea_kpa)) * (1.35 * min(rs_mj / rso, 1.0) - 0.35))
    rn = rns - rnl
    return ((0.408 * delta * rn + gamma * 900 / (tmean + 273) * u2_ms * (es - ea_kpa))
            / (delta + gamma * (1 + 0.34 * u2_ms)))


def _regenerate() -> None:                                    # pragma: no cover  (needs the internet)
    """Print fresh monthly tables from NASA POWER."""
    import json
    import urllib.request

    url = ("https://power.larc.nasa.gov/api/temporal/daily/point?parameters=ALLSKY_SFC_SW_DWN,T2M_MAX,T2M_MIN,"
           f"RH2M,WS2M,PRECTOTCORR&community=AG&longitude={LON}&latitude={LAT}&start=20150101&end=20241231&format=JSON")
    par = json.load(urllib.request.urlopen(url, timeout=120))["properties"]["parameter"]
    et0: dict[int, list[float]] = {m: [] for m in range(1, 13)}
    tmax: dict[int, list[float]] = {m: [] for m in range(1, 13)}
    rain: dict[int, list[float]] = {m: [] for m in range(1, 13)}
    for key in par["T2M_MAX"]:
        v = {name: series[key] for name, series in par.items()}
        if any(x == -999 for x in v.values()):                # NASA's marker for a missing day
            continue
        d = date(int(key[:4]), int(key[4:6]), int(key[6:]))
        ea = v["RH2M"] / 100 * (es_kpa(v["T2M_MAX"]) + es_kpa(v["T2M_MIN"])) / 2
        et0[d.month].append(et0_fao56(v["T2M_MAX"], v["T2M_MIN"], ea, v["WS2M"], v["ALLSKY_SFC_SW_DWN"],
                                      LAT, ELEV_M, d.timetuple().tm_yday))
        tmax[d.month].append(v["T2M_MAX"])
        rain[d.month].append(v["PRECTOTCORR"])
    for name, table in (("ET0_MM_DAY", et0), ("TMAX_C", tmax), ("RAIN_MM_DAY", rain)):
        print(name, {m: round(sum(x) / len(x), 2) for m, x in table.items()})


if __name__ == "__main__":                                    # pragma: no cover
    _regenerate()
