import requests

# Test different Rashi references
test_refs = [
    "Rashi on Genesis 1:1:1",
    "Rashi on Genesis 1:1",
    "Rashi on Genesis 1",
    "Rashi on Shabbat 15a:2:1"
]

for ref in test_refs:
    print(f"\n=== Testing {ref} ===")
    try:
        response = requests.get(f'http://localhost:8000/api/texts/{ref}')
        data = response.json()
        
        print('Versions:', len(data.get('versions', [])))
        has_english = False
        has_hebrew = False
        
        for i, v in enumerate(data.get('versions', [])):
            lang = v.get("language")
            text = str(v.get("text", ""))
            text_length = len(text)
            
            if text_length > 0:
                print(f'Version {i}: lang={lang}, text_length={text_length}')
                if lang == "en":
                    has_english = True
                    print(f'English text preview: {text[:100]}')
                elif lang == "he":
                    has_hebrew = True
                    print(f'Hebrew text preview: {text[:100]}')
        
        print(f'Has English: {has_english}, Has Hebrew: {has_hebrew}')
        
    except Exception as e:
        print(f'Error: {e}')
