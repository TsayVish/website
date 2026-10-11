/**
 * DRAFTS of tsayvish's legal pages, written in plain English as a starting point.
 * They have NOT been reviewed by a lawyer. Have counsel review and adapt them
 * (company name, governing law, addresses, ages, payment terms) before launch.
 */
export type LegalDoc = { slug: string; title: string; summary: string; updated: string; sections: { heading: string; body: string[] }[] };

const UPDATED = "October 12, 2026";
const CONTACT = "legal@tsayvish.com";

export const LEGAL_DOCS: LegalDoc[] = [
  {
    slug: "terms",
    title: "Terms of Service",
    summary: "The rules for using tsayvish.",
    updated: UPDATED,
    sections: [
      { heading: "Who we are", body: ["tsayvish (“we”, “us”) runs a platform where people create, manage and license characters, and offer services to other creators. These terms apply when you use tsayvish.com and the tsayvish Studio."] },
      { heading: "Your account", body: [
        "You must be at least 18 years old, or the age of majority where you live, to create an account.",
        "Give accurate information, keep your password safe, and tell us at " + CONTACT + " if you think someone else has used your account. You’re responsible for what happens under your account.",
      ] },
      { heading: "Your content and characters", body: [
        "You keep ownership of the characters, artwork, posts and other content you put on tsayvish.",
        "You give us a non-exclusive, worldwide, royalty-free license to host, display and share your content as needed to run tsayvish (for example, showing your public listings to visitors and in search engines). This license ends when you delete the content, except for copies we must keep for legal reasons or that others have already licensed from you.",
        "Only upload content you own or have permission to use. Don’t upload anyone’s likeness without their consent.",
      ] },
      { heading: "The Marketplace", body: [
        "Listings, offers and agreements are between the people involved. tsayvish isn’t a party to them unless we say so in writing.",
        "Offers aren’t binding until both parties sign an agreement. Template agreements we provide are a convenience, not legal advice.",
        "Until checkout launches, payment is arranged directly between buyer and seller. We aren’t responsible for payments made outside tsayvish.",
      ] },
      { heading: "Services from tsayvish", body: ["When you request a service (for example trademark filing or a storefront), we’ll confirm scope, timing and price with you before starting. Some services, such as trademark filings, are carried out by licensed professionals we work with."] },
      { heading: "What’s not allowed", body: [
        "Infringing other people’s rights, impersonating anyone, harassment, hate, sexual content involving minors, scams, spam, malware, or trying to get around our safety limits.",
        "We may remove content, limit features or close accounts that break these rules. You can report anything that looks wrong from its page.",
      ] },
      { heading: "AI features", body: ["If you use AI tools on tsayvish, you’re responsible for reviewing what they produce before publishing it, and for labelling AI-generated content where platforms or laws require it."] },
      { heading: "AI Studio credits", body: [
        "Generating images, voice and video in the AI Studio uses credits. You see the price before each generation, and it’s taken from your balance when the generation starts.",
        "If a generation fails, its credits are returned automatically. Stopping a generation after it has started doesn’t return its credits.",
        "Credits are bought in US dollars through our payment provider, Stripe. They don’t expire, can’t be transferred or exchanged for cash, and aren’t refundable except where the law requires. Prices may change; changes never affect credits you already have.",
      ] },
      { heading: "Disclaimers and liability", body: [
        "tsayvish is provided “as is”. To the extent the law allows, we aren’t liable for indirect or consequential losses, and our total liability to you is limited to the amount you paid us in the 12 months before the claim.",
      ] },
      { heading: "Changes and contact", body: ["We may update these terms. If changes are significant, we’ll tell you before they take effect. Questions: " + CONTACT + "."] },
    ],
  },
  {
    slug: "privacy",
    title: "Privacy Policy",
    summary: "What we collect, why, and your choices.",
    updated: UPDATED,
    sections: [
      { heading: "What we collect", body: [
        "Account details: your name, email, password (stored hashed by our authentication provider) or Google sign-in.",
        "What you add: profile, characters, images, listings, posts, messages, offers and agreements.",
        "Usage: pages viewed (including which listings and profiles you view, shown to creators as counts), device and log data.",
      ] },
      { heading: "How we use it", body: ["To run tsayvish, show your public content, deliver messages and notifications, keep the platform safe (including reviewing reports), provide the services you request, and improve the product."] },
      { heading: "Who can see what", body: [
        "Public listings, discoverable profiles and public posts can be seen by anyone, including search engines. Messages, chat photos and agreements are only visible to the people in them, and to our staff when needed to investigate a report or keep the platform safe.",
        "You can hide your profile from Discover and search in Settings.",
      ] },
      { heading: "Who we share it with", body: ["Service providers who host and run tsayvish for us (for example Supabase for our database and Vercel for hosting), professionals who carry out services you request, and authorities when the law requires it. We don’t sell your personal information."] },
      { heading: "Your rights", body: ["You can see and change most of your information in Settings. To get a copy of your data or delete your account, email " + CONTACT + ". Depending on where you live (for example under GDPR or CCPA), you may have further rights, which we’ll honour."] },
      { heading: "Keeping it", body: ["We keep your information while your account is open, and afterwards only as long as needed for legal, safety or accounting reasons."] },
      { heading: "Contact", body: ["Questions about privacy: " + CONTACT + "."] },
    ],
  },
  {
    slug: "creator-agreement",
    title: "Creator Agreement",
    summary: "Extra terms for people who list characters and services.",
    updated: UPDATED,
    sections: [
      { heading: "Rights you confirm", body: [
        "When you list or upload a character, you confirm you own it or have permission to manage and license it, and that its use won’t infringe anyone else’s rights.",
        "If a character is based on a real person, you confirm you have that person’s written consent.",
      ] },
      { heading: "Listings and offers", body: ["Describe what you offer accurately, respond to offers in good time, and only accept offers you intend to honour. Accepted offers should be followed by a written agreement before work or use begins."] },
      { heading: "Fees", body: ["Listing is free during early access. When checkout launches, tsayvish will take a platform fee on sales made through tsayvish, shown to you before you accept an offer."] },
      { heading: "Services you request from us", body: ["Requested services start only after we confirm scope and price with you. We’ll post progress updates on the service’s page in your Studio."] },
      { heading: "Takedowns", body: ["If we receive a valid complaint about your content, we may remove it and will tell you why. You can respond with a counter-notice as described in our DMCA policy."] },
    ],
  },
  {
    slug: "dmca",
    title: "Copyright and DMCA Policy",
    summary: "How to report content that infringes your rights.",
    updated: UPDATED,
    sections: [
      { heading: "Reporting infringement", body: [
        "If you believe content on tsayvish infringes your copyright or trademark, send a notice to " + CONTACT + " with: your contact details; the work you own; the link to the content on tsayvish; a statement that you believe in good faith the use isn’t authorised; a statement, under penalty of perjury, that your notice is accurate and you’re the owner or authorised to act for them; and your physical or electronic signature.",
        "Members can also use “Report” on any listing, post or profile. Our team reviews every report.",
      ] },
      { heading: "What happens next", body: ["We’ll remove or disable the content if the notice is valid, and tell the person who posted it. Repeat infringers will have their accounts closed."] },
      { heading: "Counter-notice", body: ["If your content was removed by mistake, email " + CONTACT + " with the removed content, a statement under penalty of perjury that it was removed by mistake, your contact details, and consent to the jurisdiction of the relevant court. We may restore it after 10 business days unless the complainant starts legal action."] },
    ],
  },
];

export const legalDoc = (slug: string) => LEGAL_DOCS.find((d) => d.slug === slug);
