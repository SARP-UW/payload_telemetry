import requests
import json

from fastapi import FastAPI

app = FastAPI()

response = requests.get("https://api.stackexchange.com/2.2/questions?order=desc&sort=activity&site=stackoverflow")

for question in response.json()['items']:
    print(question['title'])

# @app.get("/")
# async def root():
#     return {"message": "Hello World"}


