# Note that this script was written almost entirely by GPT-4

from telethon.sync import TelegramClient
from telethon.tl.functions.messages import GetHistoryRequest
from telethon.tl.functions.channels import JoinChannelRequest
from telethon.errors import FloodWaitError
import time
import re

# number: 13158782833

api_id = 29817185
channels = ['https://t.me/mad_apes_gambles']  # list of channels

client = TelegramClient('anon', api_id, api_hash)

# Global variable for the filename. if we need a ton of training data, we can use sqllite or a regular db
ETH_ADDRESSES_FILE = './ethereum_addresses_for_uniswap.txt'

def check_eth_address(message, file):
    # Ethereum addresses start with '0x' followed by 40 hexadecimal characters
    eth_address_pattern = r'\b0x[a-fA-F0-9]{40}\b'
    match = re.search(eth_address_pattern, message)

    if match:
        eth_address = match.group(0)
        print(f'Ethereum address found: {eth_address}')

        # Append address to file
        file.write(eth_address + '\n')

        return eth_address

    return None
    
    

async def main():
    for channel in channels:
        print(f"Fetching messages from {channel}")
        # Joining the channel
        await client(JoinChannelRequest(channel))

        # Getting all messages from the channel
        offset_id = 0
        limit = 100
        max_requests = 100 #how many requests to do in total
        all_messages = []
        request_count = 0
        while True:
            if request_count >= max_requests:
                print(f"Reached maximum request limit for {channel}")
                break
            try:
                history = await client(GetHistoryRequest(
                    peer=channel,
                    offset_id=offset_id,
                    offset_date=None,
                    add_offset=0,
                    limit=limit,
                    max_id=0,
                    min_id=0,
                    hash=0
                ))
                if not history.messages:
                    break
                messages = history.messages
                for message in messages:
                    all_messages.append(message.to_dict())
                offset_id = messages[len(messages) - 1].id
                time.sleep(1)  # Sleep to respect Telegram's rate limit
                request_count += 1
            except FloodWaitError as e:
                print('We have reached the limit. Sleeping for', e.seconds)
                time.sleep(e.seconds)
                continue

        for msg in all_messages:
            print(msg)
        with open(ETH_ADDRESSES_FILE, 'a') as f:
            for msg in all_messages:
                if 'message' in msg:
                    check_eth_address(msg['message'], f)

with client:
    client.loop.run_until_complete(main())
