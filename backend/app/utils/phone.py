import re


def normalize_msisdn(raw):
    """Kenyan mobile number -> the 2547XXXXXXXX / 2541XXXXXXXX form SasaPay wants, or None.
    Accepts how people actually type it: 0712 345 678, +254 712 345 678, 712345678, 254712345678."""
    digits = re.sub(r"\D", "", str(raw or ""))
    if digits.startswith("0") and len(digits) == 10:
        digits = "254" + digits[1:]
    elif len(digits) == 9 and digits[0] in "71":
        digits = "254" + digits
    return digits if re.fullmatch(r"254[17]\d{8}", digits) else None
