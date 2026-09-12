// Welcome to OmniMux - 向导页交互逻辑

document.addEventListener("DOMContentLoaded", () => {
	const btnGetStarted = document.getElementById("btn-get-started");

	btnGetStarted.addEventListener("click", async () => {
		try {
			// 1. 获取当前窗口
			const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
			if (currentTab && currentTab.windowId && chrome.sidePanel && chrome.sidePanel.open) {
				// 唤起侧边栏
				await chrome.sidePanel.open({ windowId: currentTab.windowId });
			}
		} catch (e) {
			console.log("Open sidepanel note:", e);
		}

		// 2. 引导文案切换与完成反馈
		btnGetStarted.textContent = "✓ Let's Create!";
		btnGetStarted.style.background = "#22c55e";

		setTimeout(() => {
			window.close();
		}, 600);
	});
});
