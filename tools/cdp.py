import json, sys
from playwright.sync_api import sync_playwright
code = open(sys.argv[1], encoding="utf-8").read()
with sync_playwright() as p:
    b = p.chromium.connect_over_cdp("http://localhost:9334")
    page = b.contexts[0].pages[0]
    print(json.dumps(page.evaluate("async () => {" + code + "}"), ensure_ascii=False, indent=1)[:6000])
