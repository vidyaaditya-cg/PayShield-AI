
import os
from pathlib import Path
from dotenv import load_dotenv
from google import genai

load_dotenv(Path(__file__).resolve().parent / ".env")

api_key = os.getenv("GEMINI_API_KEY")

print("Starting Gemini test...", flush=True)

try:
    client = genai.Client(api_key=api_key)

    print("Sending request...", flush=True)

    response = client.interactions.create(
        model="gemini-3.8-flash",
        input="Reply with exactly: PayShield AI is online!"
    )

    print("\nSUCCESS!", flush=True)
    print(response.output_text, flush=True)

    client.close()

except Exception as e:
    print("\nERROR:", flush=True)
    print(type(e).__name__, flush=True)
    print(str(e), flush=True)
