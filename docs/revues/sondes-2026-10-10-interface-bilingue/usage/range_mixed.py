"""Le panneau de plage en français dans un navigateur en-US, et en anglais dans un navigateur fr-FR."""
from lib import BASE, chrome, click, open_app, prefs, settle, shot, wait
for browser, lang in (("en-US", "fr"), ("fr-FR", "en")):
    with chrome(1440, 900, browser) as c:
        tab = c.open(f"{BASE}/")
        prefs(tab, lang, "dark")
        open_app(tab, "#mode=journal", ready=False)
        wait(tab, "!!document.querySelector('.j-row-head')")
        settle(1.0)
        click(tab, ".j-range-open"); settle(0.6)
        shot(tab, f"{lang}-in-{browser}-j-range")
        print(browser, lang, tab.js("document.documentElement.lang"), tab.js("[...document.querySelectorAll('.j-range input')].map(i => i.type + ':' + (i.lang || '-')).join(',')"))
