export const fmtTime = (t: number) =>
  new Date(t).toLocaleTimeString('en-GB', { hour12: false });
