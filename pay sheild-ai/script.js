const LOCAL_API_URL = "http://127.0.0.1:8000/analyze";
const PRODUCTION_API_URL = "https://YOUR-RENDER-SERVICE.onrender.com/analyze";

const isLocal =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

const API_URL = isLocal ? LOCAL_API_URL : PRODUCTION_API_URL;

const loginPage = document.getElementById("loginPage");
const appPage = document.getElementById("appPage");
const loginForm = document.getElementById("loginForm");
const paymentForm = document.getElementById("paymentForm");

function showCorrectPage() {
    if (!loginPage || !appPage) return;

    const loggedIn = sessionStorage.getItem("payshieldLoggedIn") === "true";
    loginPage.classList.toggle("hidden", loggedIn);
    appPage.classList.toggle("hidden", !loggedIn);
}

// LOGIN

if (loginForm) {
    loginForm.addEventListener("submit", event => {
        event.preventDefault();

        const email = document.getElementById("loginEmail")?.value.trim() || "";
        const password = document.getElementById("loginPassword")?.value || "";

        if (!email || password.length < 6) {
            alert("Please enter a valid email and a password with at least 6 characters.");
            return;
        }

        sessionStorage.setItem("payshieldLoggedIn", "true");
        showCorrectPage();
    });
}

const logoutButton = document.getElementById("logoutButton");

if (logoutButton) {
    logoutButton.addEventListener("click", () => {
        sessionStorage.removeItem("payshieldLoggedIn");
        sessionStorage.removeItem("payshieldReport");
        window.location.reload();
    });
}

showCorrectPage();

// FORM HELPERS

function getFieldValue(id) {
    const field =
        document.getElementById(id) ||
        document.querySelector(`[name="${id}"]`);

    return field?.value?.trim?.() || "";
}

function selected(name) {
    return document.querySelector(`input[name="${name}"]:checked`)?.value || "";
}

function getPaymentData() {
    return {
        paymentType: selected("paymentType"),
        frequency: selected("frequency"),
        expected: Number(getFieldValue("expected")),
        amount: Number(getFieldValue("amount")),
        trial: selected("trial"),
        refund: selected("refund"),
        purpose: getFieldValue("purpose"),
        terms: getFieldValue("terms")
    };
}

function formatAmount(value) {
    if (!value || !Number.isFinite(Number(value))) return "—";

    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
    }).format(value);
}

// LIVE PAYMENT PREVIEW

function setTextIfPresent(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

function updatePreview() {
    setTextIfPresent("previewAmount", formatAmount(getFieldValue("amount")));
    setTextIfPresent("previewPurpose", getFieldValue("purpose") || "Not specified");
    setTextIfPresent("previewType", selected("paymentType") || "Not specified");
    setTextIfPresent("previewFrequency", selected("frequency") || "Not specified");
}

if (paymentForm) {
    paymentForm.addEventListener("input", updatePreview);
    paymentForm.addEventListener("change", updatePreview);
    updatePreview();
}

// VALIDATION

function validatePayment(payment) {
    if (!payment.purpose) {
        return "Please enter the purpose of this payment.";
    }

    if (payment.purpose.length > 120) {
        return "Payment purpose must be 120 characters or fewer.";
    }

    if (!Number.isFinite(payment.expected) || payment.expected <= 0) {
        return "Please enter a valid expected amount.";
    }

    if (!Number.isFinite(payment.amount) || payment.amount <= 0) {
        return "Please enter a valid actual charge.";
    }

    if (payment.expected > 1000000000 || payment.amount > 1000000000) {
        return "The payment amount is too large.";
    }

    if (!payment.terms) {
        return "Please paste the payment terms before analysing.";
    }

    if (payment.terms.length > 10000) {
        return "Payment terms must be 10,000 characters or fewer.";
    }

    if (!payment.paymentType || !payment.frequency || !payment.trial || !payment.refund) {
        return "Please complete all payment details.";
    }

    return null;
}

// MESSAGE DISPLAY

function showMessage(message) {
    document.getElementById("formMessage")?.remove();

    const box = document.createElement("div");
    box.id = "formMessage";
    box.className = "finding-card finding-bad";
    box.style.marginTop = "15px";
    box.setAttribute("role", "alert");
    box.textContent = message;

    if (paymentForm) {
        paymentForm.appendChild(box);
    } else {
        alert(message);
    }
}

// ANALYSE PAYMENT

async function analyzePayment(event) {
    event?.preventDefault();

    if (!paymentForm) {
        showMessage("Payment form was not found. Check that index.html has an element with id=\"paymentForm\".");
        return;
    }

    const payment = getPaymentData();
    const validationError = validatePayment(payment);

    if (validationError) {
        showMessage(validationError);
        return;
    }

    if (!isLocal && PRODUCTION_API_URL.includes("YOUR-RENDER-SERVICE")) {
        showMessage("Set your deployed API URL in script.js, or run the site locally using Live Server.");
        return;
    }

    const button =
        document.getElementById("analyzeButton") ||
        paymentForm.querySelector(
            'button[type="submit"], input[type="submit"], button:not([type])'
        );

    const originalHTML = button?.innerHTML;

    document.getElementById("formMessage")?.remove();

    if (button) {
        button.disabled = true;
        button.textContent = "Analysing payment...";
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payment),
            signal: controller.signal
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.error || `Server returned error ${response.status}.`);
        }

        if (!data || typeof data !== "object" || Array.isArray(data)) {
            throw new Error("The server returned an invalid response.");
        }

        const report = {
            ...data,
            payment,
            analysis_type: data.analysis_type || "rule_based_fallback"
        };

        sessionStorage.setItem("payshieldReport", JSON.stringify(report));
        window.location.href = new URL("results.html", window.location.href).href;
    } catch (error) {
        console.error("Analysis error:", error);

        if (error.name === "AbortError") {
            showMessage("The analysis took too long. Please try again.");
        } else if (error instanceof TypeError) {
            showMessage("Unable to connect to the server. Check that the Python server is running and open the site using Live Server.");
        } else {
            showMessage(error.message || "Analysis failed. Please try again.");
        }
    } finally {
        clearTimeout(timeoutId);

        if (button) {
            button.disabled = false;
            button.innerHTML = originalHTML;
        }
    }
}

if (paymentForm) {
    paymentForm.addEventListener("submit", analyzePayment);

    // Also supports an Analyze button outside the form or with type="button".
    const analyzeButton =
        document.getElementById("analyzeButton") ||
        paymentForm.querySelector('button[type="button"]');

    if (analyzeButton && !paymentForm.contains(analyzeButton)) {
        analyzeButton.addEventListener("click", analyzePayment);
    } else if (analyzeButton?.type === "button") {
        analyzeButton.addEventListener("click", analyzePayment);
    }
}