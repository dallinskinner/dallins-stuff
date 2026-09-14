import styles from './TypographyApp.module.css'

export function TypographyApp() {
  return (
    <div>
      <p className={styles.lead}>
        Every size, weight, and spacing on this page is driven by the
        Typography panel — a modular type scale, not a pile of one-off
        values. Nudge a dial and the whole page redraws.
      </p>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Headings</div>
        <h1 className={`${styles.heading} hero`}>The quick brown fox jumps over the lazy dog</h1>
        <h1 className={styles.heading}>The quick brown fox jumps over the lazy dog</h1>
        <h2 className={styles.heading}>The quick brown fox jumps over the lazy dog</h2>
        <h3 className={styles.heading}>The quick brown fox jumps over the lazy dog</h3>
        <h4 className={styles.heading}>The quick brown fox jumps over the lazy dog</h4>
        <h5 className={styles.heading}>The quick brown fox jumps over the lazy dog</h5>
        <h6 className={styles.heading}>The quick brown fox jumps over the lazy dog</h6>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Body</div>
        <p>
          This is a regular paragraph, set at the base size with the
          configured line height, letter spacing, and measure. It exists
          mostly to be read, which is a low bar that a surprising number of
          websites fail to clear.
        </p>
        <p>
          It can hold <strong>bold text</strong>, <em>italic text</em>, and{' '}
          <a href="#">a link</a> without anything catching fire. There is
          also <small>small print</small>, for disclaimers and regrets.
        </p>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Lists</div>
        <p>
          <small>Long items, wrapping onto multiple lines</small>
        </p>
        <ul>
          <li>
            First, an unordered item long enough to wrap onto a second line,
            so you can actually compare the gap between items against the gap
            within one
          </li>
          <li>
            Second, with a nested list of its own, because hierarchies inside
            hierarchies are apparently just how documentation works now
            <ul>
              <li>
                A nested item that also runs long enough to wrap, if only to
                prove the indentation holds up under pressure
              </li>
              <li>Nested item two, kept mercifully short for contrast</li>
            </ul>
          </li>
          <li>
            Third, and done — though "done" is doing a lot of work in a
            sentence about a list that could apparently grow forever
          </li>
        </ul>

        <p>
          <small>Short items, staying on one line</small>
        </p>
        <ul>
          <li>Milk</li>
          <li>Eggs</li>
          <li>Bread</li>
          <li>A reason to leave the house</li>
        </ul>

        <ol>
          <li>Pick a base size and a scale ratio</li>
          <li>Adjust heading and body weight until it feels right</li>
          <li>Stop fiddling and ship it</li>
        </ol>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Code</div>
        <p>
          Inline code like <code>useDialKit()</code> sits a touch smaller
          than body text and shares its font stack with code blocks.
        </p>
        <pre>
          <code>{`function scale(base: number, ratio: number, step: number) {
  return base * ratio ** step
}`}</code>
        </pre>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Blockquote</div>
        <blockquote>
          Typography is what language looks like.
        </blockquote>
      </div>
    </div>
  )
}
