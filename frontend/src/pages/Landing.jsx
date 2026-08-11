import { Link } from 'react-router-dom'
import './Landing.css'

/**
 * Real homepage. Visual design is unchanged from the mockup — every "Join free"
 * CTA now routes to /register (Login.jsx handles both login and registration,
 * hitting the real /api/auth/register endpoint) instead of a dead '#' link.
 */
export default function Landing() {
  return (
    <>
      <nav>
        <div className="wrap">
          <div className="logo"><span className="logo-dot"></span>Juana</div>
          <div className="nav-links">
            <a href="#modes">How it works</a>
            <a href="#nearby">Nearby</a>
            <a href="#trust">Safety</a>
            <Link to="/login">Log in</Link>
          </div>
          <Link to="/register" className="nav-cta">Join free</Link>
        </div>
      </nav>

      <header className="hero">
        <div className="wrap">
          <div>
            <span className="eyebrow">● live · 4,213 people out right now</span>
            <h1>Meeting people shouldn't start with a <em>cold DM.</em></h1>
            <p className="lede">Juana gives you a reason to say hi. Join a hangout, chat with the group, and slide into a real conversation with the person you actually clicked with — no opener required.</p>
            <div className="hero-ctas">
              <Link to="/register" className="btn-primary">Join free</Link>
              <a href="#modes" className="btn-ghost">See how it works</a>
            </div>
            <p className="hero-note">NO CREDIT CARD · READY IN 2 MINUTES</p>
          </div>

          <div className="radar-frame" aria-hidden="true">
            <div className="ring"></div>
            <div className="ring r2"></div>
            <div className="ring r3"></div>
            <div className="ring r4"></div>
            <div className="sweep"></div>

            <div className="ping" style={{ top: '12%', left: '66%', animationDelay: '.3s' }}></div>
            <span className="solo-tag" style={{ top: '8%', left: '70%' }}>hola sent</span>

            <div className="ping lime" style={{ top: '74%', left: '18%', animationDelay: '1.1s' }}></div>
            <span className="solo-tag" style={{ top: '80%', left: '14%' }}>2 min ago</span>

            <div className="ping" style={{ top: '70%', left: '78%', animationDelay: '1.9s' }}></div>

            <div className="cluster">
              <div className="tag">HAPPENING NOW</div>
              <div className="title">Trivia Night @ Fable</div>
              <div className="sub">0.4 mi away</div>
              <div className="avatars">
                <span></span><span></span><span></span><span></span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section id="modes">
        <div className="wrap">
          <div className="section-head">
            <span className="eyebrow">Two ways in</span>
            <h2>Talk one-on-one, or walk into a room already talking.</h2>
            <p>Some nights you know exactly who you want to talk to. Other nights you just want to be around people. Juana works either way.</p>
          </div>
          <div className="two-col">
            <div className="mode-card">
              <div className="mode-icon coral">◐</div>
              <h3>Hola</h3>
              <p>Direct messages, the way you'd expect. See someone's profile, send a hola, and take the conversation wherever it goes.</p>
              <ul className="mode-list">
                <li>One-to-one chat</li>
                <li>You choose who you talk to</li>
                <li>No group, no pressure</li>
              </ul>
            </div>
            <div className="mode-card hangout">
              <div className="mode-icon lime">◑</div>
              <h3>Hangouts</h3>
              <p>Join a hangout — game night, trivia, a Friday meetup — and you're dropped into a group chat with everyone else who's in. Click with someone? Jump straight into their inbox.</p>
              <ul className="mode-list">
                <li>Auto-created group chat on join</li>
                <li>Jump into any member's inbox</li>
                <li>Hosted, so someone's steering</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="section-head">
            <span className="eyebrow">How a hangout works</span>
            <h2>Four steps from bored to in the room.</h2>
          </div>
          <div className="steps">
            <div className="step">
              <div className="num">01</div>
              <h3>Find one</h3>
              <p>Browse hangouts happening near you tonight, or start your own in under a minute.</p>
            </div>
            <div className="step">
              <div className="num">02</div>
              <h3>Join</h3>
              <p>You're added to the group chat instantly. No approval, no waiting around.</p>
            </div>
            <div className="step">
              <div className="num">03</div>
              <h3>Talk</h3>
              <p>Chat with the whole group as people show up and the plan comes together.</p>
            </div>
            <div className="step">
              <div className="num">04</div>
              <h3>Break off</h3>
              <p>Hit it off with someone? Open their inbox directly from the group, any time.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="nearby">
        <div className="wrap">
          <div className="nearby">
            <div>
              <span className="eyebrow">Nearby, right now</span>
              <h2 style={{ fontSize: 32, marginTop: 14 }}>Bored at the bar? See who's around.</h2>
              <p style={{ color: 'var(--slate)', marginTop: 16, fontSize: 15 }}>Turn on "nearby" for a session and Juana shows you hangouts and people at your venue — nothing more precise than that. Turn it off and you disappear instantly. Nobody sees you unless you've switched it on.</p>
            </div>
            <div className="venue-list">
              <div className="venue">
                <div>
                  <div className="name">Fable — Trivia Night</div>
                  <div className="meta">6 PEOPLE · VISIBLE FOR 2H</div>
                </div>
                <div className="toggle"></div>
              </div>
              <div className="venue">
                <div>
                  <div className="name">The Yard Rooftop</div>
                  <div className="meta">3 PEOPLE · VISIBLE FOR 45M</div>
                </div>
                <div className="toggle"></div>
              </div>
              <div className="venue off">
                <div>
                  <div className="name">Home</div>
                  <div className="meta">HIDDEN</div>
                </div>
                <div className="toggle"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="trust">
        <div className="wrap">
          <div className="section-head">
            <span className="eyebrow">Built to feel safe out loud</span>
            <h2>Presence is a choice you make, not a default.</h2>
          </div>
          <div className="trust-grid">
            <div className="trust-card">
              <span className="eyebrow" style={{ color: 'var(--coral)' }}>Off by default</span>
              <h3>Nothing is visible until you turn it on</h3>
              <p>Location visibility is session-based and expires on its own. No always-on tracking, ever.</p>
            </div>
            <div className="trust-card">
              <span className="eyebrow" style={{ color: 'var(--coral)' }}>Hosted groups</span>
              <h3>Every hangout has someone steering</h3>
              <p>Hosts can remove anyone from the group. Report and block work the same in a hangout as they do in a hola.</p>
            </div>
            <div className="trust-card">
              <span className="eyebrow" style={{ color: 'var(--coral)' }}>Verified people</span>
              <h3>Real people, checked before they show up</h3>
              <p>Profile verification is required before you can join a hangout or appear as nearby.</p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="cta-band">
            <span className="eyebrow" style={{ color: 'var(--ink)', opacity: 0.7 }}>Ready when you are</span>
            <h2>Your next hangout is already forming.</h2>
            <Link to="/register" className="btn-primary">Join free</Link>
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap">
          <div className="logo"><span className="logo-dot"></span>Juana</div>
          <p className="fine">© 2026 Juana. Made for people who'd rather show up than swipe.</p>
        </div>
      </footer>
    </>
  )
}
