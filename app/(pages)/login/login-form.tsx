"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { requestLoginCode, verifyLoginCode } from "@/app/(pages)/actions";
import { DUR_BASE, EASE_OUT_EXPO } from "@/components/motion-tokens";

/**
 * Two-step sign-in on one page.
 *
 * No navigation between steps: the code is live for ten minutes and tied to
 * the address just typed, so a route change that could be back-buttoned into
 * a half-finished state buys nothing. Both steps are one component holding
 * one piece of state.
 *
 * ON FOCUS: this deliberately does NOT trap focus. The overlay components
 * trap because they cover the page and everything behind them is inert —
 * trapping on an ordinary page would strand keyboard users inside a form,
 * unable to reach the header, the footer or the browser's own chrome, which
 * is an accessibility failure rather than a feature. What a page owes instead
 * is focus MANAGEMENT: move focus deliberately when the view changes, and
 * announce the change. Both are done below.
 */

const CODE_LENGTH = 6;
const RESEND_SECONDS = 60;

const label = "meta block text-[10px] tracking-[0.14em] text-text-secondary";
const field =
  "meta w-full border border-border bg-surface px-3 py-3 text-[14px] text-text placeholder:text-text-secondary focus:border-text focus:outline-none disabled:opacity-50";

type Status =
  | { kind: "idle" }
  | { kind: "error"; message: string; retryAfterSeconds?: number }
  | { kind: "notice"; message: string };

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const reduced = useReducedMotion();

  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [digits, setDigits] = useState<string[]>(() =>
    Array(CODE_LENGTH).fill(""),
  );
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [signedIn, setSignedIn] = useState(false);
  const [pending, start] = useTransition();

  const emailRef = useRef<HTMLInputElement>(null);
  const boxRefs = useRef<(HTMLInputElement | null)[]>([]);

  const code = digits.join("");
  const codeComplete = code.length === CODE_LENGTH && /^\d+$/.test(code);

  /* ---------------------------------------------------------------------
     RESEND COUNTDOWN
     --------------------------------------------------------------------- */

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = window.setInterval(() => {
      setSecondsLeft((n) => (n <= 1 ? 0 : n - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [secondsLeft]);

  /* ---------------------------------------------------------------------
     STEP 1 — EMAIL
     --------------------------------------------------------------------- */

  /**
   * Permissive on purpose, and matched to the server's own rule. Real
   * validation of an address is delivery; anything stricter here rejects
   * valid addresses that simply look unusual.
   */
  function validateEmail(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return "Enter your email address.";
    if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(trimmed))
      return "That does not look like an email address.";
    return null;
  }

  const send = useCallback(
    (address: string, { isResend }: { isResend: boolean }) => {
      setStatus({ kind: "idle" });

      start(async () => {
        const res = await requestLoginCode(address);

        if (res.ok) {
          setStep(2);
          setSecondsLeft(RESEND_SECONDS);
          if (isResend) {
            setDigits(Array(CODE_LENGTH).fill(""));
            setStatus({ kind: "notice", message: "A new code is on its way." });
          }
          return;
        }

        // The server decides how long to wait. Inventing a number here would
        // either lock the customer out longer than necessary or let them
        // retry into a refusal.
        if (res.retryAfterSeconds) setSecondsLeft(res.retryAfterSeconds);

        // An email that failed to send is not a wrong code and must not read
        // like one — the customer needs to know to try again, not to go
        // hunting through an inbox for something that never left.
        setStatus({
          kind: "error",
          message: res.message,
          retryAfterSeconds: res.retryAfterSeconds,
        });

        // A rejected address belongs next to the field it came from.
        if (res.code === "invalid_email") {
          setEmailError(res.message);
          setStep(1);
        }
      });
    },
    [],
  );

  function onSubmitEmail(e: React.FormEvent) {
    e.preventDefault();
    const problem = validateEmail(email);
    setEmailError(problem);
    if (problem) {
      emailRef.current?.focus();
      return;
    }
    send(email.trim(), { isResend: false });
  }

  /* ---------------------------------------------------------------------
     STEP 2 — CODE
     --------------------------------------------------------------------- */

  // Focus the first box when the step appears. This is the focus management
  // that replaces trapping: the view changed, so the caret goes where the
  // next keystroke is expected.
  useEffect(() => {
    if (step === 2) boxRefs.current[0]?.focus();
  }, [step]);

  function setDigitAt(index: number, value: string) {
    setDigits((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function onDigitChange(index: number, raw: string) {
    const only = raw.replace(/\D/g, "");
    if (!only) {
      setDigitAt(index, "");
      return;
    }

    // Typing over a filled box, or a mobile keyboard delivering several
    // characters at once, spills forward rather than being truncated.
    const chars = only.split("");
    setDigits((prev) => {
      const next = [...prev];
      for (let i = 0; i < chars.length && index + i < CODE_LENGTH; i++) {
        next[index + i] = chars[i];
      }
      return next;
    });

    const landed = Math.min(index + chars.length, CODE_LENGTH - 1);
    boxRefs.current[landed]?.focus();
    boxRefs.current[landed]?.select();
  }

  function onDigitKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      // Backspace in an empty box steps back and clears the previous one, so
      // holding it walks the whole code out rather than stalling.
      if (!digits[index] && index > 0) {
        e.preventDefault();
        setDigitAt(index - 1, "");
        boxRefs.current[index - 1]?.focus();
      }
      return;
    }
    if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      boxRefs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowRight" && index < CODE_LENGTH - 1) {
      e.preventDefault();
      boxRefs.current[index + 1]?.focus();
    }
    if (e.key === "Enter" && codeComplete) {
      e.preventDefault();
      verify();
    }
  }

  /** Pasting the whole code into any box fills all of them. */
  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!pasted) return;
    e.preventDefault();

    const chars = pasted.slice(0, CODE_LENGTH).split("");
    const next = Array(CODE_LENGTH).fill("");
    chars.forEach((c, i) => (next[i] = c));
    setDigits(next);

    const landed = Math.min(chars.length, CODE_LENGTH - 1);
    boxRefs.current[landed]?.focus();
  }

  const verify = useCallback(() => {
    if (!codeComplete) return;
    setStatus({ kind: "idle" });

    start(async () => {
      const res = await verifyLoginCode(email.trim(), code);

      if (res.ok) {
        setSignedIn(true);
        // Server Components cached the logged-out header; refresh before
        // navigating or the destination renders as though nobody signed in.
        router.refresh();
        router.push(next);
        return;
      }

      setStatus({ kind: "error", message: res.message });
      setDigits(Array(CODE_LENGTH).fill(""));
      boxRefs.current[0]?.focus();
    });
  }, [code, codeComplete, email, next, router]);

  /* ---------------------------------------------------------------------
     RENDER
     --------------------------------------------------------------------- */

  const stepMotion = reduced
    ? { initial: false, animate: {}, exit: {} }
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -8 },
        transition: { duration: DUR_BASE, ease: EASE_OUT_EXPO },
      };

  return (
    <div className="w-[min(380px,100%)]">
      {/* One live region for the whole flow, so a step change, an error and a
          success are all announced without three competing regions. */}
      <p role="status" aria-live="polite" className="sr-only">
        {signedIn
          ? "Signed in. Taking you back."
          : step === 1
            ? "Step 1 of 2. Enter your email address."
            : `Step 2 of 2. Enter the ${CODE_LENGTH}-digit code sent to ${email}.`}
      </p>

      <AnimatePresence mode="wait" initial={false}>
        {step === 1 ? (
          <motion.form
            key="email"
            {...stepMotion}
            onSubmit={onSubmitEmail}
            noValidate
          >
            <h1 className="text-[22px] leading-tight">SIGN IN</h1>
            <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
              We&rsquo;ll email you a six-digit code. No password to remember.
            </p>

            <div className="mt-7">
              <label className={label} htmlFor="email">
                EMAIL
              </label>
              <input
                ref={emailRef}
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                autoFocus
                required
                value={email}
                disabled={pending}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError(null);
                }}
                onBlur={() => email && setEmailError(validateEmail(email))}
                aria-invalid={emailError ? true : undefined}
                aria-describedby={emailError ? "email-error" : undefined}
                placeholder="you@example.com"
                className={`${field} mt-1.5 ${emailError ? "border-text" : ""}`}
              />
              {emailError && (
                <p id="email-error" className="meta mt-2 text-[10px] text-text">
                  {emailError.toUpperCase()}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={pending}
              className="btn-press meta mt-6 w-full border border-text bg-text px-5 py-3 text-[11px] tracking-[0.14em] text-bg hover:opacity-80 disabled:opacity-50"
            >
              {pending ? "SENDING…" : "SEND CODE"}
            </button>

            {status.kind === "error" && (
              <p className="meta mt-4 text-[10px] leading-relaxed text-text">
                {status.message.toUpperCase()}
              </p>
            )}
          </motion.form>
        ) : (
          <motion.div key="code" {...stepMotion}>
            <h1 className="text-[22px] leading-tight">ENTER CODE</h1>
            <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
              Sent to <span className="text-text">{email}</span>. It expires in
              10 minutes.
            </p>

            <fieldset
              className="mt-7 border-0 p-0"
              disabled={pending || signedIn}
            >
              <legend className={label}>SIX-DIGIT CODE</legend>

              <div className="mt-2 flex gap-2" onPaste={onPaste}>
                {digits.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      boxRefs.current[i] = el;
                    }}
                    // Each box is labelled individually — "digit 3 of 6" is
                    // what a screen reader needs; six identical "Code" labels
                    // would be useless.
                    aria-label={`Digit ${i + 1} of ${CODE_LENGTH}`}
                    // Only the first carries it: the platform fills the whole
                    // code from the first field, and repeating the hint makes
                    // some clients offer it six times.
                    autoComplete={i === 0 ? "one-time-code" : "off"}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => onDigitChange(i, e.target.value)}
                    onKeyDown={(e) => onDigitKeyDown(i, e)}
                    onFocus={(e) => e.currentTarget.select()}
                    className="meta h-14 w-full min-w-0 border border-border bg-surface text-center text-[20px] tabular-nums text-text focus:border-text focus:outline-none disabled:opacity-50"
                  />
                ))}
              </div>
            </fieldset>

            <button
              type="button"
              onClick={verify}
              disabled={!codeComplete || pending || signedIn}
              className="btn-press meta mt-6 w-full border border-text bg-text px-5 py-3 text-[11px] tracking-[0.14em] text-bg hover:opacity-80 disabled:opacity-50"
            >
              {signedIn ? "SIGNED IN" : pending ? "VERIFYING…" : "VERIFY"}
            </button>

            {status.kind === "error" && (
              <p className="meta mt-4 text-[10px] leading-relaxed text-text">
                {status.message.toUpperCase()}
              </p>
            )}
            {status.kind === "notice" && (
              <p className="meta mt-4 text-[10px] leading-relaxed text-text-secondary">
                {status.message.toUpperCase()}
              </p>
            )}

            <div className="mt-7 flex items-center justify-between gap-4 border-t border-border pt-5">
              <button
                type="button"
                onClick={() => send(email.trim(), { isResend: true })}
                disabled={secondsLeft > 0 || pending || signedIn}
                className="meta text-[10px] tracking-[0.12em] text-text-secondary underline-offset-4 transition-opacity duration-[var(--dur-fast)] ease-[var(--ease-out-expo)] hover:text-text hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:hover:text-text-secondary"
              >
                {secondsLeft > 0 ? `RESEND IN ${secondsLeft}S` : "RESEND CODE"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setDigits(Array(CODE_LENGTH).fill(""));
                  setStatus({ kind: "idle" });
                  setSecondsLeft(0);
                }}
                disabled={pending || signedIn}
                className="meta text-[10px] tracking-[0.12em] text-text-secondary underline-offset-4 transition-opacity duration-[var(--dur-fast)] ease-[var(--ease-out-expo)] hover:text-text hover:underline disabled:opacity-50"
              >
                CHANGE EMAIL
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
