"""
SasaPay integration.

Docs: https://docs.sasapay.app/
Auth: GET {base}/api/v1/auth/token/?grant_type=client_credentials, HTTP Basic Auth
      with client_id/client_secret, returns a bearer access_token (short-lived —
      cache and refetch on 401 rather than caching forever).

Collections (C2B): POST {base}/api/v1/payments/request-payment/
  - NetworkCode "0" = SasaPay wallet -> sends the payer a 6-digit OTP, which the
    client must then submit to /payments/process-payment/ to complete the charge.
  - NetworkCode for M-Pesa/Airtel/etc -> sends an STK push to the payer's phone,
    no OTP step needed; SasaPay confirms via the IPN callback instead.

Payouts (B2C): POST {base}/api/v1/payments/b2c/ — sends money to a phone number
  on a mobile money channel. This is what host withdrawals use.

Both flows are asynchronous: the initial POST just means "request sent," and the
real result arrives later via the CallBackURL you supply (see routes/webhooks.py).
Never mark a Transaction as completed from the initial response alone.
"""
import time
import requests
from app.utils.settings import get_sasapay_config


class SasaPayError(Exception):
    pass


_token_cache = {"access_token": None, "expires_at": 0}


def get_access_token():
    if _token_cache["access_token"] and _token_cache["expires_at"] > time.time():
        return _token_cache["access_token"]

    cfg = get_sasapay_config()
    if not cfg["client_id"] or not cfg["client_secret"]:
        raise SasaPayError(
            "SasaPay is not configured yet — set credentials in Admin → Finance → Settings, "
            "or via SASAPAY_CLIENT_ID/SASAPAY_CLIENT_SECRET in .env."
        )

    res = requests.get(
        f"{cfg['base_url']}/api/v1/auth/token/",
        params={"grant_type": "client_credentials"},
        auth=(cfg["client_id"], cfg["client_secret"]),
        timeout=15,
    )
    res.raise_for_status()
    data = res.json()

    _token_cache["access_token"] = data["access_token"]
    # SasaPay returns expires_in seconds; refresh a bit early to be safe.
    _token_cache["expires_at"] = time.time() + int(data.get("expires_in", 3600)) - 60
    return _token_cache["access_token"]


def _headers():
    return {"Authorization": f"Bearer {get_access_token()}", "Content-Type": "application/json"}


def request_collection(*, phone_number, amount, network_code, account_reference,
                        transaction_desc, callback_url):
    """
    Kicks off a C2B collection — pass purchase flow.
    network_code "0" = SasaPay wallet (OTP flow), otherwise the mobile-money channel
    code SasaPay assigns (e.g. M-Pesa) — pull the current list from their docs,
    it's not fixed enough to hardcode here.
    Returns SasaPay's response dict, including CheckoutRequestID to track this attempt.
    """
    cfg = get_sasapay_config()
    res = requests.post(
        f"{cfg['base_url']}/api/v1/payments/request-payment/",
        headers=_headers(),
        json={
            "MerchantCode": cfg["merchant_code"],
            "NetworkCode": network_code,
            "Currency": "KES",
            "Amount": str(amount),
            "CallBackURL": callback_url,
            "PhoneNumber": phone_number,
            "TransactionDesc": transaction_desc,
            "AccountReference": account_reference,
        },
        timeout=20,
    )
    if not res.ok:
        raise SasaPayError(f"SasaPay collection request failed: {res.status_code} {res.text}")
    return res.json()


def process_wallet_otp(*, checkout_request_id, verification_code):
    """Only needed when network_code was '0' (SasaPay wallet) — completes the OTP step."""
    cfg = get_sasapay_config()
    res = requests.post(
        f"{cfg['base_url']}/api/v1/payments/process-payment/",
        headers=_headers(),
        json={
            "CheckoutRequestID": checkout_request_id,
            "MerchantCode": cfg["merchant_code"],
            "VerificationCode": verification_code,
        },
        timeout=20,
    )
    if not res.ok:
        raise SasaPayError(f"SasaPay OTP confirmation failed: {res.status_code} {res.text}")
    return res.json()


def send_payout(*, phone_number, amount, reference, reason, callback_url):
    """B2C — used for host withdrawals. Funds are debited from the merchant's Utility Account."""
    cfg = get_sasapay_config()
    res = requests.post(
        f"{cfg['base_url']}/api/v1/payments/b2c/",
        headers=_headers(),
        json={
            "MerchantCode": cfg["merchant_code"],
            "MerchantTransactionReference": reference,
            "Amount": str(amount),
            "Currency": "KES",
            "ReceiverNumber": phone_number,
            "Channel": "0",
            "Reason": reason,
            "CallBackURL": callback_url,
        },
        timeout=20,
    )
    if not res.ok:
        raise SasaPayError(f"SasaPay payout failed: {res.status_code} {res.text}")
    return res.json()
