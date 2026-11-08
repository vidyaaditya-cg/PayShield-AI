
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from decimal import Decimal, InvalidOperation
from urllib.parse import urlsplit
import json
import re
import os

# Render deployment settings
HOST = "0.0.0.0"
PORT = int(os.environ.get("PORT", 8000))

MAX_REQUEST_SIZE = 50000
MAX_AMOUNT = Decimal("1000000000")
MAX_TERMS_LENGTH = 10000

# Add your Netlify URL in Render's environment variables.
# Local development origins are allowed automatically.
ALLOWED_ORIGINS = {
    origin.strip()
    for origin in os.environ.get("ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
}

ALLOWED_TYPES = {
    "One-time payment",
    "Subscription",
    "Free trial",
    "Online purchase"
}

ALLOWED_FREQUENCIES = {
    "One-time",
    "Weekly",
    "Monthly",
    "Yearly",
    "Not sure"
}

ALLOWED_TRIAL = {"Yes", "No", "Not sure"}

ALLOWED_REFUND = {
    "Refundable",
    "Non-refundable",
    "Not sure"
}


def valid_origin(origin):
    """Allow configured website and local development origins."""

    if origin in ALLOWED_ORIGINS:
        return True

    try:
        parsed = urlsplit(origin)

        return (
            parsed.scheme == "http"
            and parsed.hostname in {"localhost", "127.0.0.1"}
            and parsed.port is not None
            and 1 <= parsed.port <= 65535
            and not parsed.username
            and not parsed.password
        )

    except ValueError:
        return False


def detect_warnings(data):

    warnings = []

    expected = data["expected"]
    amount = data["amount"]

    terms = data["terms"].lower()
    payment_type = data["paymentType"]
    frequency = data["frequency"]
    trial = data["trial"]
    refund = data["refund"]

    # Amount mismatch
    if expected != amount:

        difference = abs(expected - amount)

        warnings.append(
            f"Amount mismatch: you expected ₹{expected:.2f}, "
            f"but the listed charge is ₹{amount:.2f}. "
            f"The difference is ₹{difference:.2f}."
        )

    # Recurring payment detection
    recurring_pattern = re.compile(
        r"\b(subscription|recurring|auto[\s-]?renew(?:al)?|"
        r"renews?|renewal|billed every|charged every|"
        r"per month|per year|per week|monthly billing|"
        r"annual billing|weekly billing)\b",
        re.IGNORECASE
    )

    recurring_selected = (
        payment_type == "Subscription"
        or frequency in {"Weekly", "Monthly", "Yearly"}
    )

    if recurring_selected or recurring_pattern.search(terms):

        warnings.append(
            "Recurring payment indicator detected. "
            "Check the billing frequency, renewal date and cancellation conditions."
        )

    # Free trial detection
    trial_pattern = re.compile(
        r"\b(free trial|trial period|trial ends?|"
        r"after the trial|convert(?:s)? to paid|"
        r"charged after trial|billing begins)\b",
        re.IGNORECASE
    )

    if trial == "Yes" or trial_pattern.search(terms):

        warnings.append(
            "Free trial or trial conversion indicator detected. "
            "Check when the trial ends and when paid billing begins."
        )

    # Refund detection
    refund_pattern = re.compile(
        r"\b(non[\s-]?refundable|no refunds?|"
        r"refunds? (?:are )?not (?:available|permitted)|"
        r"all sales final)\b",
        re.IGNORECASE
    )

    if refund == "Non-refundable" or refund_pattern.search(terms):

        warnings.append(
            "Refund restriction indicator detected. "
            "Review the refund policy before proceeding."
        )

    # Cancellation conditions
    cancellation_pattern = re.compile(
        r"\b(cancel(?:lation)? fee|early termination fee|"
        r"minimum commitment|minimum subscription period|"
        r"notice period|cancellation notice)\b",
        re.IGNORECASE
    )

    if cancellation_pattern.search(terms):

        warnings.append(
            "Cancellation condition indicator detected. "
            "Review any notice period, minimum commitment or cancellation fee."
        )

    # Additional fees
    fee_pattern = re.compile(
        r"\b(processing fee|convenience fee|service fee|"
        r"handling fee|additional charge|late fee|"
        r"taxes and fees|administrative fee)\b",
        re.IGNORECASE
    )

    if fee_pattern.search(terms):

        warnings.append(
            "Additional fee indicator detected. "
            "Check whether extra charges are included in the displayed amount."
        )

    # Price changes
    price_pattern = re.compile(
        r"\b(price may change|subject to price change|"
        r"price increase|variable pricing|"
        r"rates may change)\b",
        re.IGNORECASE
    )

    if price_pattern.search(terms):

        warnings.append(
            "Price-change condition detected. "
            "The amount charged in the future may differ."
        )

    # Uncertain selections
    if frequency == "Not sure":

        warnings.append(
            "Billing frequency is uncertain. "
            "Verify how often the merchant will charge you."
        )

    if trial == "Not sure":

        warnings.append(
            "Trial status is uncertain. "
            "Check whether a trial or introductory offer applies."
        )

    if refund == "Not sure":

        warnings.append(
            "Refund policy is uncertain. "
            "Confirm the merchant's refund conditions."
        )

    return warnings


class PaymentServer(BaseHTTPRequestHandler):

    def send_json(self, status, payload):

        response = json.dumps(payload).encode("utf-8")

        self.send_response(status)

        self.send_header(
            "Content-Type",
            "application/json; charset=utf-8"
        )

        self.send_header(
            "Content-Length",
            str(len(response))
        )

        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store")

        origin = self.headers.get("Origin")

        if origin and valid_origin(origin):

            self.send_header(
                "Access-Control-Allow-Origin",
                origin
            )

            self.send_header("Vary", "Origin")

        self.end_headers()
        self.wfile.write(response)

    def do_OPTIONS(self):

        origin = self.headers.get("Origin")

        if origin and not valid_origin(origin):

            self.send_json(403, {
                "error": "Origin not allowed."
            })

            return

        self.send_response(204)

        if origin:

            self.send_header(
                "Access-Control-Allow-Origin",
                origin
            )

            self.send_header("Vary", "Origin")

        self.send_header(
            "Access-Control-Allow-Methods",
            "POST, OPTIONS"
        )

        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type"
        )

        self.send_header("Access-Control-Max-Age", "600")

        self.end_headers()

    def do_POST(self):

        if self.path != "/analyze":

            self.send_json(404, {
                "error": "Endpoint not found."
            })

            return

        origin = self.headers.get("Origin")

        if origin and not valid_origin(origin):

            self.send_json(403, {
                "error": "Origin not allowed."
            })

            return

        content_type = self.headers.get("Content-Type", "")

        if not content_type.lower().startswith("application/json"):

            self.send_json(415, {
                "error": "Content-Type must be application/json."
            })

            return

        try:

            length_header = self.headers.get("Content-Length")

            if length_header is None:

                self.send_json(411, {
                    "error": "Content-Length is required."
                })

                return

            length = int(length_header)

            if length <= 0 or length > MAX_REQUEST_SIZE:

                self.send_json(413, {
                    "error": "Request size is invalid or too large."
                })

                return

            raw_body = self.rfile.read(length)

            if len(raw_body) != length:

                self.send_json(400, {
                    "error": "Incomplete request body."
                })

                return

            data = json.loads(raw_body.decode("utf-8"))

            if not isinstance(data, dict):

                self.send_json(400, {
                    "error": "Request must contain a JSON object."
                })

                return

            required_fields = {
                "purpose",
                "expected",
                "amount",
                "terms",
                "paymentType",
                "frequency",
                "trial",
                "refund"
            }

            if not required_fields.issubset(data.keys()):

                self.send_json(400, {
                    "error": "Some required payment fields are missing."
                })

                return

            purpose = data["purpose"]
            terms = data["terms"]

            if not isinstance(purpose, str) or not purpose.strip():

                self.send_json(400, {
                    "error": "A valid payment purpose is required."
                })

                return

            if len(purpose) > 120:

                self.send_json(400, {
                    "error": "Payment purpose is too long."
                })

                return

            if not isinstance(terms, str) or not terms.strip():

                self.send_json(400, {
                    "error": "Original payment terms are required."
                })

                return

            if len(terms) > MAX_TERMS_LENGTH:

                self.send_json(400, {
                    "error": "Payment terms exceed the character limit."
                })

                return

            for field, allowed_values in [
                ("paymentType", ALLOWED_TYPES),
                ("frequency", ALLOWED_FREQUENCIES),
                ("trial", ALLOWED_TRIAL),
                ("refund", ALLOWED_REFUND)
            ]:

                if data[field] not in allowed_values:

                    self.send_json(400, {
                        "error": f"Invalid value for {field}."
                    })

                    return

            # Validate amounts
            try:

                expected = Decimal(str(data["expected"]))
                amount = Decimal(str(data["amount"]))

            except (InvalidOperation, ValueError):

                self.send_json(400, {
                    "error": "Payment amounts must be valid numbers."
                })

                return

            if not expected.is_finite() or not amount.is_finite():

                self.send_json(400, {
                    "error": "Payment amounts must be finite numbers."
                })

                return

            if (
                expected <= 0
                or amount <= 0
                or expected > MAX_AMOUNT
                or amount > MAX_AMOUNT
            ):

                self.send_json(400, {
                    "error": "Payment amounts are outside the allowed range."
                })

                return

            # Prepare validated data
            validated_data = {
                "expected": expected,
                "amount": amount,
                "terms": terms,
                "paymentType": data["paymentType"],
                "frequency": data["frequency"],
                "trial": data["trial"],
                "refund": data["refund"]
            }

            warnings = detect_warnings(validated_data)

            self.send_json(200, {
                "status": (
                    "review_required"
                    if warnings
                    else "no_rules_triggered"
                ),

                "warnings": warnings,

                "analysis_type": "rule_based",

                "disclaimer": (
                    "No predefined warning rules were triggered does not "
                    "mean that the payment is guaranteed safe."
                )
            })

        except (json.JSONDecodeError, UnicodeDecodeError):

            self.send_json(400, {
                "error": "Invalid JSON request."
            })

        except (ValueError, TypeError):

            self.send_json(400, {
                "error": "Invalid payment information."
            })

        except Exception:

            self.send_json(500, {
                "error": "An internal analysis error occurred."
            })

    def log_message(self, format, *args):

        print("[PayShield]", format % args)


if __name__ == "__main__":

    server = ThreadingHTTPServer((HOST, PORT), PaymentServer)

    print("-----------------------------------")
    print("       PayShield AI Server")
    print("-----------------------------------")
    print(f"Server running on port {PORT}")
    print("Press Ctrl+C to stop the server.")

    try:

        server.serve_forever()

    except KeyboardInterrupt:

        print("\nStopping PayShield AI server...")

    finally:

        server.server_close()
