import google.generativeai as genai
import os
from dotenv import load_dotenv

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

def check_model_quota(model_name):
    print(f"--- Checking Quota for {model_name} ---")
    try:
        model = genai.GenerativeModel(model_name)
        response = model.generate_content("Say 'OK'")
        print(f"Result: SUCCESS - {response.text.strip()}")
    except Exception as e:
        if "429" in str(e):
            print(f"Result: EXHAUSTED - 429 Quota Exceeded.")
        else:
            print(f"Result: ERROR - {e}")

if __name__ == "__main__":
    if not os.getenv("GEMINI_API_KEY"):
        print("Error: GEMINI_API_KEY not found in .env")
    else:
        check_model_quota("gemini-2.0-flash")
        print()
        check_model_quota("gemini-2.5-flash")
