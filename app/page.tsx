import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { TwoWays } from "@/components/TwoWays";
import { WhyNow } from "@/components/WhyNow";
import { Engine } from "@/components/Engine";
import { Cast } from "@/components/Cast";
import { Builder } from "@/components/Builder";
import { Services } from "@/components/Services";
import { Audience } from "@/components/Audience";
import { Creators } from "@/components/Creators";
import { Contact } from "@/components/Contact";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Nav />
      <main id="top">
        <Hero />
        <TwoWays />
        <WhyNow />
        <Engine />
        <Cast />
        <Builder />
        <Services />
        <Audience />
        <Creators />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
