
// ========================================
// PAYSHIELD AI - API CONFIGURATION
// ========================================

// Local development uses your computer's Python server.
// Online deployment uses your Render backend URL.

const LOCAL_API_URL = "http://127.0.0.1:8000/analyze";

// IMPORTANT:
// Replace this with your actual Render URL after deployment.
const PRODUCTION_API_URL =
    "https://YOUR-RENDER-SERVICE.onrender.com/analyze";

const isLocal =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

const API_URL = isLocal
    ? LOCAL_API_URL
    : PRODUCTION_API_URL;

const MAX_AMOUNT = 1000000000;
const MAX_TERMS_LENGTH = 10000;


// ========================================
// GET SELECTED RADIO BUTTON VALUE
// ========================================

function selected(name) {
    return document.querySelector(
        `input[name="${name}"]:checked`
    )?.value || "";
}


// ========================================
// GET PAYMENT INFORMATION
// ========================================

function getPaymentData() {

    return {
        purpose: document.getElementById("purpose").value.trim(),

        expected: document.getElementById("expected").value,

        amount: document.getElementById("amount").value,

        terms: document.getElementById("terms").value.trim(),

        paymentType: selected("paymentType"),

        frequency: selected("frequency"),

        trial: selected("trial"),

        refund: selected("refund")
    };
}


// ========================================
// FORMAT AMOUNT
// ========================================

function formatAmount(value) {

    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "0";
    }

    return number.toLocaleString("en-IN", {
        maximumFractionDigits: 2
    });
}


// ========================================
// UPDATE PAYMENT X-RAY PREVIEW
// ========================================

function updatePreview() {

    const data = getPaymentData();

    document.getElementById("previewAmount").textContent =
        data.amount && Number.isFinite(Number(data.amount))
            ? formatAmount(data.amount)
            : "0";

    document.getElementById("previewPurpose").textContent =
        data.purpose || "Your purchase will appear here";

    document.getElementById("previewType").textContent =
        data.paymentType.toUpperCase();

    document.getElementById("previewFrequency").textContent =
        data.frequency.toUpperCase();


    const terms = data.terms.toLowerCase();

    const timeline = document.getElementById("timeline");

    timeline.replaceChildren();


    const events = [
        [
            "Today",
            data.amount
                ? `Initial payment: ₹${formatAmount(data.amount)}`
                : "Your initial payment"
        ]
    ];


    // Trial detection

    const trialDetected =
        data.trial === "Yes" ||
        /\bfree trial\b|\btrial period\b|\bafter the trial\b|\btrial ends?\b/.test(terms);


    if (trialDetected) {

        events.push([
            "After the trial",
            "A paid charge may begin. Check the trial end date and conversion amount."
        ]);

    }


    // Recurring payment detection

    const recurringDetected =
        data.paymentType === "Subscription" ||
        ["Weekly", "Monthly", "Yearly"].includes(data.frequency) ||
        /\bauto[- ]?renew(?:al)?\b|\brecurr(?:ing|ence)\b|\bsubscription\b|\bcharged every\b|\brenews?\b|\bper month\b|\bper year\b|\bper week\b/.test(terms);


    if (recurringDetected) {

        events.push([
            "Future renewals",
            `Recurring billing may apply. Selected frequency: ${data.frequency}.`
        ]);

    }


    // Refund detection

    if (
        data.refund === "Non-refundable" ||
        /\bnon[- ]?refundable\b|\bno refunds?\b|\brefunds? (?:are )?not (?:available|permitted)\b/.test(terms)
    ) {

        events.push([
            "Refund conditions",
            "The payment may have restricted or unavailable refunds."
        ]);

    }


    if (events.length === 1) {

        events.push([
            "After checkout",
            "Review the original conditions for future commitments."
        ]);

    }


    // Create timeline elements

    events.forEach(function(event, index) {

        const item = document.createElement("div");

        item.className = "timeline-item";


        const dot = document.createElement("span");

        dot.className = index === 0
            ? "timeline-dot"
            : "timeline-dot muted-dot";


        const content = document.createElement("div");


        const heading = document.createElement("b");

        heading.textContent = event[0];


        const description = document.createElement("p");

        description.textContent = event[1];


        content.append(heading, description);

        item.append(dot, content);

        timeline.appendChild(item);

    });

}


// ========================================
// VALIDATE PAYMENT INFORMATION
// ========================================

function validatePayment(data) {

    if (!data.purpose) {

        return "Please enter what you are paying for.";

    }


    if (data.purpose.length > 120) {

        return "The payment purpose must be 120 characters or fewer.";

    }


    if (!data.terms) {

        return "Please paste the original payment terms.";

    }


    if (data.terms.length > MAX_TERMS_LENGTH) {

        return "Payment terms must be 10,000 characters or fewer.";

    }


    for (const field of ["expected", "amount"]) {

        const value = Number(data[field]);

        if (
            data[field] === "" ||
            !Number.isFinite(value) ||
            value <= 0 ||
            value > MAX_AMOUNT
        ) {

            return "Both amounts must be greater than ₹0 and no more than ₹1,000,000,000.";

        }

    }


    if (
        !["One-time payment", "Subscription", "Free trial", "Online purchase"].includes(data.paymentType)
    ) {

        return "Please select a valid payment type.";

    }


    if (
        !["One-time", "Weekly", "Monthly", "Yearly", "Not sure"].includes(data.frequency)
    ) {

        return "Please select a valid payment frequency.";

    }


    if (
        !["Yes", "No", "Not sure"].includes(data.trial)
    ) {

        return "Please select a valid trial option.";

    }


    if (
        !["Refundable", "Non-refundable", "Not sure"].includes(data.refund)
    ) {

        return "Please select a valid refund option.";

    }


    return "";

}


// ========================================
// DISPLAY MESSAGE
// ========================================

function showMessage(message, className = "result-info") {

    const result = document.getElementById("result");

    result.replaceChildren();


    const paragraph = document.createElement("div");

    paragraph.className = className;

    paragraph.textContent = message;


    result.appendChild(paragraph);

}


// ========================================
// DISPLAY ANALYSIS RESULTS
// ========================================

function displayResults(data, payment) {

    const result = document.getElementById("result");

    result.replaceChildren();


    const warnings = data.warnings;


    const heading = document.createElement("h3");

    heading.textContent = warnings.length > 0
        ? "⚠ Review recommended"
        : "✓ No predefined warnings triggered";


    result.appendChild(heading);


    const summary = document.createElement("p");

    summary.textContent =
        `Payment: ₹${formatAmount(payment.amount)} | ${payment.paymentType} | ${payment.frequency}`;


    result.appendChild(summary);


    if (warnings.length > 0) {

        warnings.forEach(function(warning) {

            const item = document.createElement("div");

            item.className = "result-warning";

            item.textContent = "⚠ " + warning;

            result.appendChild(item);

        });

    } else {

        const item = document.createElement("div");

        item.className = "result-info";

        item.textContent =
            "No predefined warning rules were triggered. This does not prove that the payment or merchant is safe.";

        result.appendChild(item);

    }


    const information = document.createElement("div");

    information.className = "result-info";

    information.textContent =
        data.disclaimer ||
        "This result is based on predefined text-matching rules. Always verify the original checkout terms.";


    result.appendChild(information);

}


// ========================================
// ANALYZE PAYMENT
// ========================================

async function analyzePayment() {

    const payment = getPaymentData();

    const button = document.getElementById("analyzeButton");


    // Validate inputs

    const validationError = validatePayment(payment);

    if (validationError) {

        showMessage(validationError, "result-warning");

        return;

    }


    // Disable button during analysis

    button.disabled = true;

    button.textContent = "Examining your payment...";


    showMessage(
        "Examining payment details and possible commitments..."
    );


    const controller = new AbortController();

    const timeoutId = setTimeout(
        () => controller.abort(),
        30000
    );


    try {

        const response = await fetch(API_URL, {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({

                ...payment,

                expected: Number(payment.expected),

                amount: Number(payment.amount)

            }),

            signal: controller.signal

        });


        let data;


        try {

            data = await response.json();

        } catch {

            throw new Error(
                "The server returned an invalid response."
            );

        }


        if (!response.ok) {

            throw new Error(
                data.error || "The server rejected the request."
            );

        }


        if (
            !data ||
            !Array.isArray(data.warnings) ||
            !data.warnings.every(item => typeof item === "string")
        ) {

            throw new Error(
                "The server response had an unexpected format."
            );

        }


        displayResults(data, payment);


    } catch (error) {

        if (error.name === "AbortError") {

            showMessage(
                "The analysis took too long. The server may be starting up. Please try again.",
                "result-warning"
            );

        } else if (error instanceof TypeError) {

            showMessage(
                "Could not connect to the PayShield server. Check the backend URL, server status and CORS settings.",
                "result-warning"
            );

        } else {

            showMessage(
                error.message || "Something went wrong during analysis.",
                "result-warning"
            );

        }

    } finally {

        clearTimeout(timeoutId);

        button.disabled = false;

        button.innerHTML =
            'Reveal my payment <span>↗</span>';

    }

}


// ========================================
// EVENT LISTENERS
// ========================================

// Update preview when text or amounts change.

[
    "expected",
    "amount",
    "purpose",
    "terms"

].forEach(function(id) {

    document.getElementById(id).addEventListener(
        "input",
        updatePreview
    );

});


// Update preview when radio buttons change.

document.querySelectorAll(
    'input[type="radio"]'
).forEach(function(input) {

    input.addEventListener(
        "change",
        updatePreview
    );

});


// Analyze button

document.getElementById(
    "analyzeButton"
).addEventListener(
    "click",
    analyzePayment
);


// Initial preview

updatePreview();
