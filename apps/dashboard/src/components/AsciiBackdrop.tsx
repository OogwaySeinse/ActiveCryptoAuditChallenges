import { useEffect, useRef } from "react";

interface Cluster {
  x: number;
  y: number;
  vx: number;
  vy: number;
  lines: string[];
  tint: string;
  alpha: number;
  phase: number;
}

const CRYPTO_ASCII_CLUSTERS: { lines: string[]; tint: string }[] = [
  {
    lines: ["┌─ FINDING H-01 ────────────┐", "│ reentrancy in withdraw()  │", "│ severity: HIGH  ▲ dup: 3  │", "└───────────────────────────┘"],
    tint: "rgba(245, 181, 68, 0.75)",
  },
  {
    lines: ["function withdraw(uint a) external {", "  (bool ok,) = msg.sender.call{value:a}(\"\");", "  balances[msg.sender] -= a; // ✗ CEI"],
    tint: "rgba(250, 246, 232, 0.62)",
  },
  {
    lines: ["invariant: Σ balances == totalSupply", "forge test --match-test invariant_", "[FAIL] counterexample: 0x3f…a91c"],
    tint: "rgba(94, 234, 212, 0.62)",
  },
  {
    lines: ["  0x60806040 52348015 61000f", "  PUSH1 0x80 PUSH1 0x40 MSTORE", "  DELEGATECALL ── slot 0 ⚠"],
    tint: "rgba(167, 139, 250, 0.6)",
  },
  {
    lines: ["y² = x³ + 7  (mod p)   secp256k1", "e(πA, πB) = e(α,β)·e(L,γ)·e(πC,δ)", "nonce reuse ⇒ k = (z₁−z₂)/(s₁−s₂)"],
    tint: "rgba(244, 114, 182, 0.58)",
  },
  {
    lines: ["flashLoan(1e24) → swap → oracle.read()", "price_manipulated = TWAP(1 block) ✗", "profit: +4,180 ETH  ⟶  H-02"],
    tint: "rgba(245, 181, 68, 0.6)",
  },
  {
    lines: ["⟦ C4 · SHERLOCK · CANTINA · CODEHAWKS ⟧", "  ⟦ IMMUNEFI · CTFTIME · ETHGLOBAL ⟧", "  refresh_cron : 0 6 * * * UTC"],
    tint: "rgba(250, 246, 232, 0.55)",
  },
  {
    lines: ["#[account(mut, has_one = authority)]", "pub vault: Account<'info, Vault>,", "// missing signer check ⚠"],
    tint: "rgba(94, 234, 212, 0.56)",
  },
];

export function AsciiBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let animId = 0;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);
    const onResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", onResize);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const clusters: Cluster[] = CRYPTO_ASCII_CLUSTERS.map((c, i) => ({
      x: (((i % 3) + 0.5) / 3) * width + (Math.random() - 0.5) * 140,
      y: ((Math.floor(i / 3) + 0.45) / 3) * height + (Math.random() - 0.5) * 90,
      vx: (Math.random() - 0.5) * 0.18,
      vy: (Math.random() - 0.5) * 0.14,
      lines: c.lines,
      tint: c.tint,
      alpha: 0.2 + (i % 3) * 0.06,
      phase: i * 1.15,
    }));

    let tick = 0;
    const render = () => {
      tick += 0.012;
      ctx.clearRect(0, 0, width, height);
      ctx.font = '11px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textBaseline = "top";

      for (const cl of clusters) {
        if (!reducedMotion) {
          cl.x += cl.vx;
          cl.y += cl.vy;
          if (cl.x < -260) cl.x = width + 60;
          if (cl.x > width + 120) cl.x = -240;
          if (cl.y < -80) cl.y = height + 40;
          if (cl.y > height + 80) cl.y = -60;
        }
        const alpha = cl.alpha * (0.78 + 0.22 * Math.sin(tick + cl.phase));
        const grad = ctx.createRadialGradient(cl.x + 90, cl.y + 20, 4, cl.x + 90, cl.y + 20, 150);
        grad.addColorStop(0, `rgba(60, 40, 18, ${alpha * 0.9})`);
        grad.addColorStop(0.55, `rgba(28, 20, 30, ${alpha * 0.45})`);
        grad.addColorStop(1, "rgba(10, 9, 14, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cl.x + 90, cl.y + 20, 150, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = cl.tint;
        cl.lines.forEach((line, idx) => ctx.fillText(line, cl.x, cl.y + idx * 15));
        ctx.restore();
      }
      if (!reducedMotion) animId = window.requestAnimationFrame(render);
    };
    render();

    return () => {
      window.removeEventListener("resize", onResize);
      if (animId) window.cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden select-none" aria-hidden="true">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 16% 14%, rgba(120, 76, 20, 0.34) 0%, transparent 46%), radial-gradient(circle at 84% 22%, rgba(88, 52, 140, 0.26) 0%, transparent 48%), radial-gradient(circle at 50% 82%, rgba(20, 90, 84, 0.26) 0%, transparent 55%), linear-gradient(180deg, #0d0c10 0%, #111016 48%, #0a090d 100%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(250,246,232,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(250,246,232,0.18) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full opacity-90" />
    </div>
  );
}

