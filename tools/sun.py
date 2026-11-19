"""מיקום השמש וצל, בשעון שמש מקומי. משמש את דף התסריט; באפליקציה עצמה יחליף אותו suncalc."""
import math

LAT = 31.8986

def sun(day_of_year, hour):
    """מחזיר (גובה, אזימוט) במעלות. אזימוט מהצפון, עם כיוון השעון."""
    lat = math.radians(LAT)
    dec = math.radians(23.44 * math.sin(2 * math.pi * (284 + day_of_year) / 365))
    h = math.radians(15 * (hour - 12))
    alt = math.asin(math.sin(lat) * math.sin(dec) + math.cos(lat) * math.cos(dec) * math.cos(h))
    az = math.atan2(math.sin(h), math.cos(h) * math.sin(lat) - math.tan(dec) * math.cos(lat)) + math.pi
    return math.degrees(alt), math.degrees(az) % 360

def shadow_vec(day_of_year, hour, height):
    alt, az = sun(day_of_year, hour)
    if alt <= 0:
        return None
    L = height / math.tan(math.radians(alt))
    return (-math.sin(math.radians(az)) * L, -math.cos(math.radians(az)) * L, L, alt, az)

if __name__ == "__main__":
    for name, n in (("21.12", 355), ("21.3", 80), ("21.6", 172)):
        for hr in (9, 12, 15):
            v = shadow_vec(n, hr, 99)
            print(name, hr, "alt %.1f az %.0f shadow %.0f m" % (v[3], v[4], v[2]))
