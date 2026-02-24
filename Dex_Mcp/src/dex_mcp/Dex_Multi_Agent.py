from agents import Agent,Runner,AsyncOpenAI,AIChatCompletionsModel,
from dotenv import load_dotenv
import os
load_dotenv()
gemini_api_key = os.getenv("GEMINI_API_KEY")

external_client = AsyncOpenAI(
    api_key=gemini_api_key,
    base_url = "https://generativelanguage.googleapis.com/v1beta/openai/"

)
model = AIChatCompletionsModel(
    client=external_client,
    model_name="gemini-pro",

)
Pool_liquidity_Agent = Agent(
    name = "Pool_Agent",
    model = model,
    instructions = "You will manage all my pool activities",

)
Arbitrage_Agent = Agent(
     name = "Arbitrage_Agent",
     model = model,
     instructions = "You are arbitrage agent . You will acquire arbitrage opportunities",
)
Liquidity_Agent = Agent(
     name = "Liquidity Manager",
     model = model,
     instructions = "You are arbitrage agent . You will acquire arbitrage opportunities",
)
Risk_Operator = Agent(
     name = "Risk_Agent",
     model = model,
     instructions = "You are Risk agent.You will manage risk",
)


