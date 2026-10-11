import { CopyEmail } from "./CopyEmail";
import { CONTACT_EMAIL } from "@/lib/content";

export function Contact() {
  return (
    <section id="contact" className="flush-top" aria-labelledby="contact-title">
      <div className="wrap contact">
        <span className="eyebrow">Say hello</span>
        <h2 id="contact-title">Got a brand, a factory or a character? Let&rsquo;s talk.</h2>
        <p className="lede">
          We&rsquo;re working with brand partners, licensees, manufacturers and creators. Write to us and Vish or Alexa
          will reply.
        </p>
        <CopyEmail email={CONTACT_EMAIL} />
      </div>
    </section>
  );
}
