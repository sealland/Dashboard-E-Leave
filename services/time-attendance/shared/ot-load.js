export function shouldRefreshMainAfterOtLoad({ needOt, needHeadcount }) {
  return !needOt || !needHeadcount;
}

export function shouldStopLoadingAfterOtLoad({ needOt, needHeadcount }) {
  return !needOt || !needHeadcount;
}
