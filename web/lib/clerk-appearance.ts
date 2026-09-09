/**
 * Clerk theming, shared by every surface that renders a Clerk component.
 *
 * One definition, because there are three of them now: the marketing drawer, /sign-in and
 * /sign-up. A user who opens the drawer, closes it, and later follows a direct link to
 * /sign-in should not find a differently-styled form; and a themed widget that only two of
 * the three surfaces use is a theme that will drift.
 *
 * Plain data, no functions, so a server component can pass it straight to Clerk's client
 * components as a prop.
 */
export const CLERK_APPEARANCE = {
  variables: {
    colorBackground: "transparent",
    colorText: "#f0f0f5",
    colorTextSecondary: "#b9b9c6",
    colorPrimary: "#56ccf2",
    colorInputBackground: "#0b0b10",
    colorInputText: "#f0f0f5",
    colorDanger: "#ff7a8a",
    colorSuccess: "#00f5a0",
    colorWarning: "#f2c14e",
    borderRadius: "12px",
    fontFamily: '"Satoshi", ui-sans-serif, system-ui, sans-serif',
  },
  elements: {
    rootBox: { width: "100%" },
    cardBox: { width: "100%", boxShadow: "none", border: "0" },
    card: { background: "transparent", boxShadow: "none", padding: "0", border: "0" },
    header: { display: "none" },
    footer: { background: "transparent" },
    // The social button keeps the neumorphic treatment, since it is chrome rather than data, but
    // carries a hairline as well, because on a surface this dark the raised shadow alone
    // does not read as a pressable boundary.
    socialButtonsBlockButton: {
      background: "linear-gradient(145deg, #18181f, #101016)",
      border: "1px solid #2a2f3d",
      boxShadow: "-3px -3px 8px rgba(180,230,255,.045), 4px 4px 12px rgba(0,0,0,.72)",
      color: "#f0f0f5",
      minHeight: "46px",
      "&:hover": {
        borderColor: "#64708a",
        boxShadow: "-6px -6px 16px rgba(180,230,255,.045), 9px 9px 26px rgba(0,0,0,.72)",
      },
    },
    dividerLine: { background: "#2a2f3d" },
    dividerText: {
      color: "#888899",
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: "10px",
      letterSpacing: "0.14em",
      textTransform: "uppercase" as const,
    },
    formFieldLabel: {
      color: "#f0f0f5",
      fontFamily: '"Clash Display", sans-serif',
      fontWeight: 600,
    },
    // `--edge`, not `--edge-soft`. An input is a component whose boundary has to be
    // identifiable (WCAG 1.4.11); the soft rule measures 1.72:1 and left the field
    // indistinguishable from the drawer behind it.
    formFieldInput: {
      background: "#0b0b10",
      border: "1px solid #64708a",
      color: "#f0f0f5",
      "&::placeholder": { color: "#888899" },
      "&:focus": { borderColor: "#56ccf2", boxShadow: "0 0 0 2px rgba(86,204,242,.3)" },
    },
    formButtonPrimary: {
      background: "linear-gradient(145deg, #64d0f3, #439fbd)",
      color: "#0a0d0e",
      fontFamily: '"JetBrains Mono", monospace',
      fontWeight: 700,
      textTransform: "none" as const,
      boxShadow: "-4px -4px 12px rgba(180,230,255,.045), 6px 6px 20px rgba(0,0,0,.72)",
      "&:hover": { background: "linear-gradient(145deg, #9ae0fa, #439fbd)" },
    },
    // Clerk's default footer text is dim enough on this surface to read as disabled. It is
    // the only route to sign-up from here, so it has to be legible rather than decorative.
    footerAction: { background: "transparent" },
    footerActionText: { color: "#b9b9c6" },
    footerActionLink: { color: "#56ccf2" },
    identityPreviewEditButton: { color: "#56ccf2" },
  },
};
