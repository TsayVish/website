// Simple line icons for the Studio (24×24, drawn with currentColor).
const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export const IconGrid = () => (<svg {...base}><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></svg>);
export const IconSpark = () => (<svg {...base}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M6.3 17.7l2.5-2.5M15.2 8.8l2.5-2.5" /></svg>);
export const IconHandshake = () => (<svg {...base}><path d="M3 11l4-4 3 1 2-2 3 1 6 5" /><path d="M7 7v6l5 5 2-2" /><path d="M14 16l2-2M16 18l2-2M21 12l-3 3" /></svg>);
export const IconUser = () => (<svg {...base}><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c1.2-3.6 4-5 7-5s5.8 1.4 7 5" /></svg>);
export const IconPlus = () => (<svg {...base}><path d="M12 5v14M5 12h14" /></svg>);
export const IconStore = () => (<svg {...base}><path d="M4 9.5 5.5 4h13L20 9.5" /><path d="M4 9.5c0 1.4 1.1 2.5 2.7 2.5s2.6-1.1 2.6-2.5c0 1.4 1.2 2.5 2.7 2.5s2.7-1.1 2.7-2.5c0 1.4 1 2.5 2.6 2.5S20 10.9 20 9.5" /><path d="M5.5 12v8h13v-8" /><path d="M10 20v-4.5h4V20" /></svg>);
export const IconGear = () => (<svg {...base}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>);
export const IconCompass = () => (<svg {...base}><circle cx="12" cy="12" r="8.5" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></svg>);
export const IconSearch = () => (<svg {...base}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>);
export const IconChat = () => (<svg {...base}><path d="M4 5.5h16v10H9l-5 4z" /><path d="M8 9.5h8M8 12.5h5" /></svg>);
export const IconDashboard = () => (<svg {...base}><rect x="3.5" y="3.5" width="17" height="17" rx="2.5" /><path d="M3.5 9.5h17M9.5 9.5v11" /></svg>);
export const IconDoc = () => (<svg {...base}><path d="M6 3.5h8l4 4v13H6z" /><path d="M14 3.5v4h4M9 12h6M9 15.5h6" /></svg>);
export const IconPeople = () => (<svg {...base}><circle cx="9" cy="9" r="3.2" /><path d="M3.5 19c.9-3 3-4.5 5.5-4.5s4.6 1.5 5.5 4.5" /><circle cx="16.5" cy="8" r="2.6" /><path d="M15.5 13.6c2.4.1 4.2 1.6 5 4.4" /></svg>);
export const IconChart = () => (<svg {...base}><path d="M4 20V4M4 20h16M8.5 16v-4M12.5 16V8M16.5 16v-6" /></svg>);
export const IconWallet = () => (<svg {...base}><rect x="3.5" y="6" width="17" height="13" rx="2.5" /><path d="M3.5 10h17M16 14.5h1.5" /></svg>);
export const IconShield = () => (<svg {...base}><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z" /></svg>);
export const IconTag = () => (<svg {...base}><path d="M3.5 12.5V4.5h8l9 9-8 8z" /><circle cx="8" cy="9" r="1.3" /></svg>);
export const IconCheck = () => (<svg {...base}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>);
