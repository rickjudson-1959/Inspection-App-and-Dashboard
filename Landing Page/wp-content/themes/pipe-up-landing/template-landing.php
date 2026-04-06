<?php
/*
Template Name: Pipe-Up Landing Page
*/
wp_enqueue_style('pu-fonts', 'https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700&family=Outfit:wght@400;500;600;700;800&display=swap', array(), null);
get_header();
?>

<div class="pu-landing">

<nav class="pu-nav">
  <div class="pu-nav-inner">
    <a href="#" class="pu-nav-logo">Pipe<span>-Up</span></a>
    <div class="pu-nav-links">
      <a href="#pu-problem">Why Pipe-Up</a>
      <a href="#pu-features">Features</a>
      <a href="#pu-demo">Demo</a>
      <a href="#pu-contact" class="pu-nav-cta">Request a Demo</a>
    </div>
  </div>
</nav>

<section class="pu-hero">
  <div class="pu-hero-grid"></div>
  <div class="pu-hero-inner">
    <div class="pu-hero-content">
      <h1>Know where your pipeline project stands. <em>Every single day.</em></h1>
      <p>Pipe-Up gives project owners daily visibility into costs, schedule, and contractor performance. No more surprises at invoice time. No more flying blind between weekly reports.</p>
      <div class="pu-hero-buttons">
        <a href="#pu-contact" class="pu-btn-primary">Request a Demo &#8594;</a>
        <a href="#pu-demo" class="pu-btn-secondary">&#9654; Watch Overview</a>
      </div>
    </div>
    <div class="pu-hero-visual">
      <div class="pu-dashboard-mock">
        <div class="pu-dash-card">
          <div class="pu-dash-card-label">Budget Status</div>
          <div class="pu-dash-card-value amber">$14.2M</div>
          <div class="pu-dash-card-delta">of $13.8M forecast (+2.9%)</div>
        </div>
        <div class="pu-dash-card">
          <div class="pu-dash-card-label">Schedule Variance</div>
          <div class="pu-dash-card-value red">+6 days</div>
          <div class="pu-dash-card-delta">behind original baseline</div>
        </div>
        <div class="pu-dash-card">
          <div class="pu-dash-card-label">Reports Today</div>
          <div class="pu-dash-card-value green">12</div>
          <div class="pu-dash-card-delta">of 14 inspectors reported</div>
        </div>
        <div class="pu-dash-card">
          <div class="pu-dash-card-label">Active Spreads</div>
          <div class="pu-dash-card-value">3</div>
          <div class="pu-dash-card-delta">across 47 km</div>
        </div>
        <div class="pu-dash-bar-row">
          <div class="pu-dash-bar-label">Phase Completion</div>
          <div class="pu-dash-bars">
            <div class="pu-dash-bar-item">
              <span class="pu-dash-bar-name">Clearing</span>
              <div class="pu-dash-bar-track"><div class="pu-dash-bar-fill pu-fill-green" style="width:92%"></div></div>
              <span class="pu-dash-bar-pct">92%</span>
            </div>
            <div class="pu-dash-bar-item">
              <span class="pu-dash-bar-name">Grading</span>
              <div class="pu-dash-bar-track"><div class="pu-dash-bar-fill pu-fill-green" style="width:78%"></div></div>
              <span class="pu-dash-bar-pct">78%</span>
            </div>
            <div class="pu-dash-bar-item">
              <span class="pu-dash-bar-name">Stringing</span>
              <div class="pu-dash-bar-track"><div class="pu-dash-bar-fill pu-fill-amber" style="width:45%"></div></div>
              <span class="pu-dash-bar-pct">45%</span>
            </div>
            <div class="pu-dash-bar-item">
              <span class="pu-dash-bar-name">Welding</span>
              <div class="pu-dash-bar-track"><div class="pu-dash-bar-fill pu-fill-red" style="width:23%"></div></div>
              <span class="pu-dash-bar-pct">23%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="pu-trust-bar">
  <div class="pu-trust-inner">
    <p>Built by a pipeline construction manager with 20+ years in the field</p>
  </div>
</section>

<section class="pu-problem" id="pu-problem">
  <div class="pu-problem-inner">
    <div class="pu-section-label">The Problem</div>
    <h2>Pipeline owners are flying blind between weekly reports</h2>
    <p>By the time you see the numbers, it's too late to course-correct. Contractors know this. The information gap between daily field activity and your desk is where projects bleed money.</p>
    <div class="pu-pain-cards">
      <div class="pu-pain-card">
        <div class="pu-pain-icon">&#128200;</div>
        <h3>Cost Surprises at Invoice Time</h3>
        <p>You don't find out a phase is over budget until the contractor submits their invoice. By then, the money's spent and the leverage is gone.</p>
      </div>
      <div class="pu-pain-card">
        <div class="pu-pain-icon">&#128197;</div>
        <h3>Schedule Slippage You Can't See</h3>
        <p>Weekly reports tell you where the project was. Not where it is. Not where it's heading. Small delays compound into months before anyone notices.</p>
      </div>
      <div class="pu-pain-card">
        <div class="pu-pain-icon">&#128209;</div>
        <h3>Field Data Buried in PDFs</h3>
        <p>Your inspectors capture valuable data every day, but it sits in static reports nobody aggregates. The insights are there. The visibility isn't.</p>
      </div>
    </div>
  </div>
</section>

<section class="pu-features" id="pu-features">
  <div class="pu-features-inner">
    <div class="pu-section-label">The Solution</div>
    <h2>Daily visibility from field to front office</h2>
    <p>Pipe-Up turns inspector field reports into real-time project intelligence you can act on.</p>
    <div class="pu-feature-grid">
      <div class="pu-feature-card">
        <div class="pu-feature-icon">&#128176;</div>
        <h3>Daily Cost Tracking</h3>
        <p>See forecasted vs. actual spend by phase, updated every day from field data. Know the delta between your original budget and current trajectory before the contractor does.</p>
      </div>
      <div class="pu-feature-card">
        <div class="pu-feature-icon">&#128203;</div>
        <h3>Schedule Variance Analysis</h3>
        <p>Original baseline vs. current reality, broken down by activity. See which phases are slipping and by how much, with projected completion dates that update daily.</p>
      </div>
      <div class="pu-feature-card">
        <div class="pu-feature-icon">&#128100;</div>
        <h3>Contractor Performance</h3>
        <p>Track crew productivity, equipment utilization, and time lost by contractor. Objective data for those conversations you need to have.</p>
      </div>
      <div class="pu-feature-card">
        <div class="pu-feature-icon">&#128221;</div>
        <h3>Digital Inspector Reports</h3>
        <p>Inspectors submit structured daily reports from the field. Activities, labour, equipment, chainages, photos, safety notes. All in one place, all searchable.</p>
      </div>
      <div class="pu-feature-card">
        <div class="pu-feature-icon">&#128202;</div>
        <h3>PMT Dashboard</h3>
        <p>One screen shows you everything: budget status, schedule health, completion percentages, and flagged issues. Check it in 2 minutes with your morning coffee.</p>
      </div>
      <div class="pu-feature-card">
        <div class="pu-feature-icon">&#128270;</div>
        <h3>AI-Powered Document Search</h3>
        <p>Ask a question, get an answer from your project specs and drawings. No more digging through binders. Your inspectors find what they need in seconds.</p>
      </div>
    </div>
  </div>
</section>

<section class="pu-how">
  <div class="pu-how-inner">
    <div class="pu-section-label">How It Works</div>
    <h2>From field to dashboard in real time</h2>
    <div class="pu-steps">
      <div class="pu-step">
        <div class="pu-step-num">01</div>
        <h3>Inspectors Report Daily</h3>
        <p>Your inspectors fill out structured digital reports from the field. Activities, labour counts, equipment hours, chainages, and photos. Takes them the same time as their current process.</p>
      </div>
      <div class="pu-step">
        <div class="pu-step-num">02</div>
        <h3>Data Rolls Up Automatically</h3>
        <p>Pipe-Up aggregates field data against your project baseline. Cost actuals tie to contractor rates. Schedule progress ties to planned milestones. No manual spreadsheet work.</p>
      </div>
      <div class="pu-step">
        <div class="pu-step-num">03</div>
        <h3>You See the Full Picture</h3>
        <p>Open your PMT dashboard and see exactly where costs, schedule, and contractor performance stand. Today. Not next week. Make decisions while you still have leverage.</p>
      </div>
    </div>
  </div>
</section>

<section class="pu-demo-section" id="pu-demo">
  <div class="pu-demo-inner">
    <div class="pu-section-label">See It In Action</div>
    <h2>Watch how Pipe-Up works</h2>
    <p>A quick walkthrough of the inspector report and PMT dashboard, showing exactly how field data becomes project visibility.</p>
    <div class="pu-demo-placeholder">
      <div class="pu-play-btn">
        <svg viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg>
      </div>
      <span>Demo video coming soon</span>
    </div>
  </div>
</section>

<section class="pu-quote-section">
  <div class="pu-quote-inner">
    <div class="pu-quote-mark">"</div>
    <div class="pu-quote-text">Most PMs I talk to don't know they're bleeding money on a phase until it's too late. They're flying blind between weekly reports. That's the gap Pipe-Up closes.</div>
    <div class="pu-quote-attr">Rick Judson, Founder &amp; Pipeline Construction Manager</div>
  </div>
</section>

<section class="pu-cta" id="pu-contact">
  <div class="pu-cta-inner">
    <div class="pu-section-label">Get Started</div>
    <h2>Ready to see where your project really stands?</h2>
    <p>Request a demo and I'll show you exactly how Pipe-Up gives you daily visibility into your pipeline project. No sales pitch, just a conversation between two people who've lived on the ROW.</p>
    <form class="pu-cta-form" onsubmit="return false;">
      <input type="email" placeholder="Your email address">
      <button type="submit" class="pu-btn-primary">Request Demo</button>
    </form>
    <div class="pu-cta-subtext">Or email directly: rick@pipe-up.ca</div>
  </div>
</section>

<footer class="pu-footer">
  <div class="pu-footer-inner">
    <div class="pu-footer-logo">Pipe<span>-Up</span></div>
    <div class="pu-footer-links">
      <a href="#pu-problem">Why Pipe-Up</a>
      <a href="#pu-features">Features</a>
      <a href="#pu-demo">Demo</a>
      <a href="#pu-contact">Contact</a>
    </div>
    <div class="pu-footer-copy">&copy; 2026 Pipe-Up Inc. All rights reserved.</div>
  </div>
</footer>

</div>

<?php get_footer(); ?>
