"""
Web Navigator — LaunchOps Founder Edition
Playwright-based browser automation for research, form filling, and web tasks.
No guardrails. Full automation.
"""

from typing import Dict, Optional
import os
import json


class WebNavigator:
    """
    Browser automation using Playwright.
    Used by agents for web research, form submission, and data extraction.
    """

    def __init__(self, config: Dict = None):
        config = config or {}
        self.headless = config.get("headless", True)
        self.screenshots_dir = os.path.expanduser("~/.launchops/screenshots")
        os.makedirs(self.screenshots_dir, exist_ok=True)
        self._browser = None
        self._context = None
        self._page = None

    async def start(self):
        """Start the browser."""
        try:
            from playwright.async_api import async_playwright
            self._playwright = await async_playwright().start()
            self._browser = await self._playwright.chromium.launch(headless=self.headless)
            self._context = await self._browser.new_context(
                viewport={"width": 1920, "height": 1080},
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            )
            self._page = await self._context.new_page()
            return True
        except ImportError:
            print("[WebNavigator] Playwright not installed. Run: pip install playwright && playwright install chromium")
            return False
        except Exception as e:
            print(f"[WebNavigator] Failed to start: {e}")
            return False

    async def stop(self):
        """Stop the browser."""
        if self._browser:
            await self._browser.close()
        if hasattr(self, "_playwright") and self._playwright:
            await self._playwright.stop()

    async def navigate(self, url: str) -> Dict:
        """Navigate to a URL and return page info."""
        if not self._page:
            await self.start()

        try:
            response = await self._page.goto(url, wait_until="domcontentloaded", timeout=30000)
            title = await self._page.title()
            return {
                "success": True,
                "url": url,
                "title": title,
                "status": response.status if response else None,
            }
        except Exception as e:
            return {"success": False, "url": url, "error": str(e)}

    async def extract_text(self, selector: str = "body") -> str:
        """Extract text content from a selector."""
        if not self._page:
            return ""
        try:
            element = await self._page.query_selector(selector)
            if element:
                return await element.inner_text()
        except Exception:
            pass
        return ""

    async def screenshot(self, name: str = "screenshot") -> str:
        """Take a screenshot."""
        if not self._page:
            return ""
        path = os.path.join(self.screenshots_dir, f"{name}.png")
        await self._page.screenshot(path=path, full_page=True)
        return path

    async def fill_form(self, fields: Dict[str, str]) -> Dict:
        """Fill form fields by selector."""
        if not self._page:
            return {"success": False, "error": "No page loaded"}

        results = {}
        for selector, value in fields.items():
            try:
                await self._page.fill(selector, value)
                results[selector] = "filled"
            except Exception as e:
                results[selector] = f"error: {e}"

        return {"success": True, "fields": results}

    async def click(self, selector: str) -> bool:
        """Click an element."""
        if not self._page:
            return False
        try:
            await self._page.click(selector)
            return True
        except Exception:
            return False

    async def search_google(self, query: str) -> list:
        """Search Google and return results."""
        await self.navigate(f"https://www.google.com/search?q={query}")
        try:
            results = await self._page.query_selector_all("div.g")
            items = []
            for r in results[:10]:
                title_el = await r.query_selector("h3")
                link_el = await r.query_selector("a")
                title = await title_el.inner_text() if title_el else ""
                href = await link_el.get_attribute("href") if link_el else ""
                items.append({"title": title, "url": href})
            return items
        except Exception:
            return []

    async def research(self, topic: str) -> Dict:
        """Research a topic — search, visit top results, extract key info."""
        search_results = await self.search_google(topic)
        research_data = {"query": topic, "sources": []}

        for result in search_results[:3]:
            url = result.get("url", "")
            if url and url.startswith("http"):
                nav = await self.navigate(url)
                if nav.get("success"):
                    text = await self.extract_text("article") or await self.extract_text("main") or await self.extract_text("body")
                    research_data["sources"].append({
                        "title": result.get("title", ""),
                        "url": url,
                        "excerpt": text[:2000] if text else "",
                    })

        return research_data


class SyncWebNavigator:
    """
    Synchronous wrapper for WebNavigator.
    Uses asyncio.run() for simple sync usage.
    """

    def __init__(self, config: Dict = None):
        self._async_nav = WebNavigator(config)

    def _run(self, coro):
        import asyncio
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor() as pool:
                    return pool.submit(asyncio.run, coro).result()
            return loop.run_until_complete(coro)
        except RuntimeError:
            return asyncio.run(coro)

    def navigate(self, url: str) -> Dict:
        return self._run(self._async_nav.navigate(url))

    def extract_text(self, selector: str = "body") -> str:
        return self._run(self._async_nav.extract_text(selector))

    def screenshot(self, name: str = "screenshot") -> str:
        return self._run(self._async_nav.screenshot(name))

    def research(self, topic: str) -> Dict:
        return self._run(self._async_nav.research(topic))

    def stop(self):
        self._run(self._async_nav.stop())
