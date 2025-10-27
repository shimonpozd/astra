#!/usr/bin/env python3
"""
Скрипт для получения IAM токена из authorized_key.json для Yandex SpeechKit
"""
import json
import jwt
import time
import requests
from datetime import datetime, timedelta

def get_iam_token(service_account_key_path: str) -> str:
    """Получить IAM токен из файла ключа сервисного аккаунта"""
    
    # Читаем ключ
    with open(service_account_key_path, 'r') as f:
        key_data = json.load(f)
    
    # Создаем JWT токен
    now = int(time.time())
    payload = {
        'aud': 'https://iam.api.cloud.yandex.net/iam/v1/tokens',
        'iss': key_data['service_account_id'],
        'iat': now,
        'exp': now + 3600,  # 1 час
    }
    
    # Подписываем JWT с заголовком kid
    private_key = key_data['private_key']
    headers = {'kid': key_data['id']}
    token = jwt.encode(payload, private_key, algorithm='PS256', headers=headers)
    
    # Обмениваем JWT на IAM токен
    response = requests.post(
        'https://iam.api.cloud.yandex.net/iam/v1/tokens',
        json={'jwt': token}
    )
    
    if response.status_code == 200:
        return response.json()['iamToken']
    else:
        raise Exception(f"Failed to get IAM token: {response.text}")

if __name__ == "__main__":
    try:
        iam_token = get_iam_token('authorized_key.json')
        print(f"IAM Token: {iam_token}")
        print("\nТеперь добавьте этот токен в конфигурацию:")
        print(f"YANDEX_IAM_TOKEN={iam_token}")
    except Exception as e:
        print(f"Ошибка: {e}")
