// auth-card.jsx
import React, { useState, useMemo } from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  useMotionTemplate,
} from "framer-motion";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/* ───────── base input (shadcn style) ───────── */
export const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  return (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      className={cn(
        "placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  );
});
Input.displayName = "Input";

/* ───────── field with leading icon + password toggle + error text ───────── */
export const AuthInput = React.forwardRef(
  ({ icon: Icon, type = "text", error, className, onFocus, onBlur, ...props }, ref) => {
    const [focused, setFocused] = useState(false);
    const [show, setShow] = useState(false);
    const isPassword = type === "password";

    const handleFocus = (e) => {
      setFocused(true);
      onFocus?.(e);
    };

    const handleBlur = (e) => {
      setFocused(false);
      onBlur?.(e);
    };

    return (
      <div className="space-y-1">
        <motion.div
          className={`relative ${focused ? "z-10" : ""}`}
          whileHover={{ scale: 1.01 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
        >
          <div className="relative flex items-center overflow-hidden rounded-lg">
            {Icon && (
              <Icon
                className={`absolute left-3 h-4 w-4 transition-all duration-300 ${
                  focused ? "text-purple-300" : "text-white/40"
                }`}
              />
            )}
            <Input
              ref={ref}
              type={isPassword && show ? "text" : type}
              aria-invalid={error ? true : undefined}
              onFocus={handleFocus}
              onBlur={handleBlur}
              className={cn(
                "h-9.5 w-full border border-white/10 bg-white/[0.04] pl-10 text-white transition-all duration-300 placeholder:text-white/30 focus:border-purple-400/50 focus:bg-white/[0.08] focus:shadow-[0_0_12px_rgba(168,85,247,0.15)] text-sm",
                isPassword ? "pr-10" : "pr-3",
                className
              )}
              {...props}
            />
            {isPassword && (
              <button
                type="button"
                tabIndex={-1}
                aria-label={show ? "Hide password" : "Show password"}
                onClick={() => setShow((s) => !s)}
                className="absolute right-3 cursor-pointer"
              >
                {show ? (
                  <Eye className="h-4 w-4 text-white/50 transition-colors duration-300 hover:text-white" />
                ) : (
                  <EyeOff className="h-4 w-4 text-white/40 transition-colors duration-300 hover:text-white" />
                )}
              </button>
            )}
          </div>
        </motion.div>
        {error && <p className="px-1 text-[11px] text-red-400">{error}</p>}
      </div>
    );
  }
);
AuthInput.displayName = "AuthInput";

/* ───────── clean, elegant submit button without heavy glow ───────── */
export function AuthSubmitButton({ loading = false, children = "Sign In", ...props }) {
  return (
    <motion.button
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      type="submit"
      disabled={loading}
      className="group/button relative mt-4 w-full rounded-lg bg-white text-zinc-950 font-medium shadow-sm transition-all duration-150 hover:bg-zinc-100 hover:shadow disabled:cursor-not-allowed disabled:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
      {...props}
    >
      <div className="relative flex h-10 items-center justify-center overflow-hidden rounded-lg">
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-black/70 border-t-transparent" />
            </motion.div>
          ) : (
            <motion.span
              key="text"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center gap-1.5 text-sm font-semibold"
            >
              {children}
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover/button:translate-x-1" />
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </motion.button>
  );
}

/* ───────── INSTANT 60FPS AMBIENT CANVAS PARTICLES (ZERO LATENCY) ───────── */
function MovingParticles() {
  const canvasRef = React.useRef(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const onResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", onResize);

    // Pre-populate 55 particles across the entire viewport immediately
    const COUNT = 50;
    const particles = Array.from({ length: COUNT }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 1.6 + 0.8,
      vx: (Math.random() - 0.5) * 0.35,
      vy: -(Math.random() * 0.45 + 0.25),
      alpha: Math.random() * 0.5 + 0.25,
      alphaSpeed: (Math.random() * 0.012 + 0.005) * (Math.random() > 0.5 ? 1 : -1),
      isPurple: Math.random() > 0.65,
    }));

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < COUNT; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha += p.alphaSpeed;

        if (p.alpha > 0.75) {
          p.alpha = 0.75;
          p.alphaSpeed = -Math.abs(p.alphaSpeed);
        } else if (p.alpha < 0.2) {
          p.alpha = 0.2;
          p.alphaSpeed = Math.abs(p.alphaSpeed);
        }

        // Smooth wrap
        if (p.y < -10) {
          p.y = height + 10;
          p.x = Math.random() * width;
        }
        if (p.x < -10) p.x = width + 10;
        else if (p.x > width + 10) p.x = -10;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.isPurple
          ? `rgba(192, 132, 252, ${p.alpha})`
          : `rgba(255, 255, 255, ${p.alpha})`;
        ctx.shadowBlur = p.r * 2.5;
        ctx.shadowColor = p.isPurple ? "rgba(168, 85, 247, 0.6)" : "rgba(255, 255, 255, 0.4)";
        ctx.fill();
      }

      animId = requestAnimationFrame(render);
    };

    // Draw first frame immediately
    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-0 h-full w-full" />;
}

/* ───────── THE GLASS CARD SHELL: COMPACT & ELEGANT ───────── */
const BEAMS = [
  { cls: "top-0 left-0 h-[2px] w-[50%] bg-gradient-to-r", prop: "left", delay: 0 },
  { cls: "top-0 right-0 h-[50%] w-[2px] bg-gradient-to-b", prop: "top", delay: 0.6 },
  { cls: "bottom-0 right-0 h-[2px] w-[50%] bg-gradient-to-r", prop: "right", delay: 1.2 },
  { cls: "bottom-0 left-0 h-[50%] w-[2px] bg-gradient-to-b", prop: "bottom", delay: 1.8 },
];

export function AuthShell({ title, subtitle, children, footer }) {
  // Screen cursor tracking for dynamic spotlight
  const cursorX = useMotionValue(typeof window !== "undefined" ? window.innerWidth / 2 : 500);
  const cursorY = useMotionValue(typeof window !== "undefined" ? window.innerHeight / 2 : 500);

  // Card 3D tilt tracking
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useTransform(mouseY, [-300, 300], [6, -6]);
  const rotateY = useTransform(mouseX, [-300, 300], [-6, 6]);

  const onGlobalMouseMove = (e) => {
    cursorX.set(e.clientX);
    cursorY.set(e.clientY);
  };

  const onCardMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    mouseX.set(e.clientX - r.left - r.width / 2);
    mouseY.set(e.clientY - r.top - r.height / 2);
  };

  const onCardLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  const spotlight = useMotionTemplate`radial-gradient(650px circle at ${cursorX}px ${cursorY}px, rgba(168, 85, 247, 0.16), transparent 75%)`;

  return (
    <div
      onMouseMove={onGlobalMouseMove}
      className="relative flex min-h-screen w-screen items-center justify-center overflow-x-hidden overflow-y-auto bg-[#06060a] p-4 py-6 select-none"
    >
      {/* ── Ambient Fluid Aurora Orbs ── */}
      <motion.div
        animate={{
          x: [0, 50, -30, 0],
          y: [0, -35, 25, 0],
          scale: [1, 1.15, 0.92, 1],
        }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
        className="pointer-events-none absolute -top-24 left-1/4 h-[550px] w-[550px] rounded-full bg-gradient-to-tr from-purple-700/35 via-indigo-600/25 to-pink-600/30 blur-[130px]"
      />
      <motion.div
        animate={{
          x: [0, -45, 35, 0],
          y: [0, 35, -25, 0],
          scale: [1, 0.92, 1.18, 1],
        }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        className="pointer-events-none absolute -bottom-24 right-1/4 h-[580px] w-[580px] rounded-full bg-gradient-to-br from-pink-600/25 via-purple-800/20 to-cyan-600/20 blur-[140px]"
      />

      {/* ── Subtle Cyber Dot Grid + Mouse Spotlight ── */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.20]"
        style={{
          backgroundImage: "radial-gradient(rgba(255, 255, 255, 0.28) 1.2px, transparent 1.2px)",
          backgroundSize: "32px 32px",
        }}
      />
      <motion.div
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{ background: spotlight }}
      />

      {/* ── Flowing Living Moving Particles (Immediately Active) ── */}
      <MovingParticles />

      {/* ── Central Hero Glass Card (3D Tilt & Beams) ── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative z-10 w-full max-w-sm px-2 sm:px-0"
        style={{ perspective: 1500 }}
      >
        <motion.div
          className="relative"
          style={{ rotateX, rotateY }}
          onMouseMove={onCardMove}
          onMouseLeave={onCardLeave}
          whileHover={{ z: 8 }}
        >
          <div className="group relative">
            {/* Traveling Light Beams along Card Border */}
            <div className="absolute -inset-[1px] overflow-hidden rounded-2xl pointer-events-none">
              {BEAMS.map((b) => (
                <motion.div
                  key={b.prop}
                  className={`absolute ${b.cls} from-transparent via-purple-300 to-transparent opacity-80`}
                  initial={{ filter: "blur(2px)" }}
                  animate={{
                    [b.prop]: ["-50%", "100%"],
                    opacity: [0.4, 0.9, 0.4],
                    filter: ["blur(1px)", "blur(3px)", "blur(1px)"],
                  }}
                  transition={{
                    [b.prop]: { duration: 2.5, ease: "easeInOut", repeat: Infinity, repeatDelay: 1, delay: b.delay },
                    opacity: { duration: 1.2, repeat: Infinity, repeatType: "mirror", delay: b.delay },
                    filter: { duration: 1.5, repeat: Infinity, repeatType: "mirror", delay: b.delay },
                  }}
                />
              ))}
            </div>

            {/* Frosted Glass Card Body */}
            <div className="relative overflow-hidden rounded-2xl border border-white/[0.12] bg-[#0c0c14]/75 p-5 sm:p-6 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.85),0_0_35px_rgba(168,85,247,0.12)] backdrop-blur-2xl">
              {/* Subtle diagonal micro-grid */}
              <div
                className="absolute inset-0 opacity-[0.035] pointer-events-none"
                style={{
                  backgroundImage:
                    "linear-gradient(135deg, white 0.5px, transparent 0.5px), linear-gradient(45deg, white 0.5px, transparent 0.5px)",
                  backgroundSize: "24px 24px",
                }}
              />

              {/* Logo + Header */}
              <div className="relative mb-4 space-y-1 text-center">
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", duration: 0.8 }}
                  className="relative mx-auto flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-purple-400/30 bg-gradient-to-tr from-purple-600/30 via-pink-500/20 to-transparent shadow-[0_0_15px_rgba(168,85,247,0.3)]"
                >
                  <span className="bg-gradient-to-b from-white via-white to-purple-200 bg-clip-text text-lg font-bold text-transparent">
                    M
                  </span>
                  <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-50" />
                </motion.div>
                <motion.h1
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="bg-gradient-to-b from-white via-white/95 to-white/75 bg-clip-text text-lg font-bold tracking-tight text-transparent"
                >
                  {title}
                </motion.h1>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-xs text-white/60"
                >
                  {subtitle}
                </motion.p>
              </div>

              {/* Form Content */}
              <div className="relative">{children}</div>

              {/* Footer */}
              {footer && (
                <motion.p
                  className="relative mt-4 text-center text-xs text-white/60"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                >
                  {footer}
                </motion.p>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
