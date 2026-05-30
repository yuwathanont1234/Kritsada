import asyncio

from app.harvester.worker import run_forever

if __name__ == "__main__":
    asyncio.run(run_forever())
