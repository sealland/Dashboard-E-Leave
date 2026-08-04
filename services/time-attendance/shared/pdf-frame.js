/** Loading overlay helpers for cross-origin PDF iframes (load event is unreliable). */

export function bindPdfFrameLoading(frame, overlay, options = {}) {
  const maxWaitMs = options.maxWaitMs ?? 12000;
  const afterLoadDelayMs = options.afterLoadDelayMs ?? 600;
  let hideTimer = null;
  let maxTimer = null;
  let loading = false;

  function clearTimers() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    if (maxTimer) {
      clearTimeout(maxTimer);
      maxTimer = null;
    }
  }

  function showLoading(on) {
    loading = Boolean(on);
    if (!overlay) return;
    if (on) {
      overlay.hidden = false;
      overlay.style.display = "";
    } else {
      overlay.hidden = true;
      overlay.style.display = "none";
    }
  }

  function hideLoading() {
    clearTimers();
    showLoading(false);
  }

  function beginLoading() {
    clearTimers();
    showLoading(true);
    maxTimer = setTimeout(() => {
      if (loading) hideLoading();
    }, maxWaitMs);
  }

  function onFrameSettled() {
    if (!loading) return;
    hideTimer = setTimeout(() => {
      if (loading) hideLoading();
    }, afterLoadDelayMs);
  }

  if (frame) {
    frame.addEventListener("load", onFrameSettled);
    frame.addEventListener("error", () => {
      if (loading) hideLoading();
    });
  }

  function setFrameSrc(src) {
    if (!frame) return;
    if (!src || src === "about:blank") {
      frame.src = "about:blank";
      hideLoading();
      return;
    }
    beginLoading();
    // Reset first so a same-URL reload still fires load when it does fire
    if (frame.src === src) {
      frame.src = "about:blank";
      requestAnimationFrame(() => {
        frame.src = src;
      });
      return;
    }
    frame.src = src;
  }

  // Start clean
  hideLoading();

  return { setFrameSrc, showLoading, hideLoading, beginLoading };
}
