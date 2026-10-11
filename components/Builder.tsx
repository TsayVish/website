import { CharacterBuilder } from "./CharacterBuilder";

/** Home page section wrapping the builder in preview mode. */
export function Builder() {
  return (
    <section id="build" className="flush-top" aria-labelledby="build-title">
      <div className="wrap">
        <div className="sec-head">
          <span className="eyebrow">Build your own</span>
          <h2 id="build-title">Make a character. Switch on what it needs to grow.</h2>
          <p className="lede">
            A virtual influencer, a monster, a robot, a talking cupcake. Make any kind of character or persona, give it a
            personality, then choose the infrastructure behind it. Start small and turn more on as your audience grows.
          </p>
        </div>
        <CharacterBuilder mode="preview" />
      </div>
    </section>
  );
}
