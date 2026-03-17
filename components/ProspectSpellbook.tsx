"use client";

import { useMemo, useRef, useState } from "react";
import { spellbookEntries } from "../lib/spellbookData";

type Props = { onClose: () => void };
type PageId = "summary" | (typeof spellbookEntries)[number]["id"];

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

// ─── Couleurs parchemin — TOUTES les couleurs texte définies ici ─────────────
// Pas de CSS class, pas de styled-jsx : uniquement style={{ }} inline
// → garantit que les couleurs s'appliquent quoi qu'il arrive côté Next.js

const C = {
  // Textes sur parchemin — SOMBRES
  eyebrow: "#62320e", // brun foncé lisible
  heading: "#18080200", // inutilisé — voir ci-dessous
  h: "#180802", // quasi-noir
  body: "#2a1608", // brun très sombre
  bodyBold: "#0e0401", // noir pur pour <strong>
  muted: "#4e2e10", // brun moyen
  italic: "#5e3818",

  // Entrées sommaire
  entryBg: "rgba(255,248,225,0.28)",
  entryBgHover: "rgba(255,248,225,0.55)",
  entryBorder: "rgba(100,58,18,0.26)",
  entryLabel: "#180802",
  entrySub: "#4e2e10",
  entryIcon: "#6e3a12",
  entryArrow: "rgba(80,38,8,0.4)",

  // Tip / tarif
  tipBg: "rgba(255,248,225,0.35)",
  tipBorder: "rgba(100,58,18,0.22)",
  tipLabel: "#62320e",
  price: "#180802",

  // Reliure & chrome
  spine: "linear-gradient(180deg,#3a2510 0%,#26160a 40%,#3a2510 100%)",
  gutter:
    "linear-gradient(180deg,#b09040 0%,#806020 35%,#6a4c14 70%,#b09040 100%)",
  gutterLine:
    "linear-gradient(180deg,transparent 0%,rgba(22,10,0,0.38) 12%,rgba(22,10,0,0.38) 88%,transparent 100%)",
  pagesEdge:
    "repeating-linear-gradient(180deg,#ddd0b0 0px,#ddd0b0 1.5px,#c8b890 2px,#c8b890 3px)",
  pgNum: "rgba(60,30,6,0.36)",
  marginLine:
    "linear-gradient(180deg,transparent 0%,rgba(130,72,24,0.1) 8%,rgba(130,72,24,0.1) 92%,transparent 100%)",

  // Fond pages — parchemin chaud lisible
  pageL: `
    radial-gradient(ellipse at 10% 8%,  rgba(255,255,242,0.5) 0%, transparent 44%),
    radial-gradient(ellipse at 88% 92%, rgba(158,118,68,0.3)  0%, transparent 44%),
    linear-gradient(150deg, #e4d6b4 0%, #d8c89e 26%, #ccb882 54%, #c0a870 100%)
  `
    .replace(/\s+/g, " ")
    .trim(),
  pageR: `
    radial-gradient(ellipse at 90% 8%,  rgba(255,255,242,0.5) 0%, transparent 44%),
    radial-gradient(ellipse at 12% 92%, rgba(158,118,68,0.3)  0%, transparent 44%),
    linear-gradient(210deg, #e4d6b4 0%, #d8c89e 26%, #ccb882 54%, #c0a870 100%)
  `
    .replace(/\s+/g, " ")
    .trim(),

  // Shell
  wrap: "#0d0a06",
  wrapBorder: "rgba(88,62,22,0.42)",
  headerTitle: "#deccaa",
  headerSub: "#58401e",
  hbtnBg: "#1a1408",
  hbtnColor: "#9e7636",
  hbtnHoverBg: "#241c0c",
  hbtnHoverColor: "#c69838",
  hbtnOnBg: "#241c0c",
  hbtnOnBorder: "rgba(188,146,54,0.55)",
  hbtnOnColor: "#eebe3c",
  navIndicator: "#58401e",
  nbtnBg: "#1a1408",
  nbtnColor: "#9e7636",
  nbtnHoverBg: "#241c0c",
  nbtnHoverColor: "#c69838",
  nbtnGoldBg: "#ae8626",
  nbtnGoldBorder: "#d2a63e",
  nbtnGoldColor: "#0c0804",
  nbtnGoldHoverBg: "#be9630",
};

// ─── Sous-composants purs inline ─────────────────────────────────────────────

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: "0.58rem",
        fontWeight: 700,
        letterSpacing: "0.28em",
        textTransform: "uppercase" as const,
        color: C.eyebrow,
        marginBottom: "0.4rem",
      }}
    >
      {children}
    </p>
  );
}

function PageH({ children }: { children: React.ReactNode }) {
  return (
    <h3
      style={{
        fontFamily: "var(--font-cinzel)",
        fontSize: "1.08rem",
        fontWeight: 700,
        color: C.h,
        lineHeight: 1.22,
        marginBottom: "0.65rem",
        marginTop: 0,
      }}
    >
      {children}
    </h3>
  );
}

function BodyP({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: "0.82rem",
        lineHeight: 1.78,
        color: C.body,
        margin: 0,
      }}
    >
      {children}
    </p>
  );
}

function TipBox({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginTop: "auto", paddingTop: "0.75rem" }}>
      <div
        style={{
          padding: "0.7rem 0.9rem",
          borderRadius: "0.45rem",
          border: `1px solid ${C.tipBorder}`,
          background: C.tipBg,
        }}
      >
        <p
          style={{
            fontSize: "0.56rem",
            fontWeight: 700,
            letterSpacing: "0.2em",
            textTransform: "uppercase" as const,
            color: C.tipLabel,
            marginBottom: "0.2rem",
          }}
        >
          {label}
        </p>
        {children}
      </div>
    </div>
  );
}

function EntryBtn({
  label,
  sub,
  onClick,
}: {
  label: string;
  sub: string;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.5rem 0.65rem",
        borderRadius: "0.45rem",
        border: `1px solid ${C.entryBorder}`,
        background: hover ? C.entryBgHover : C.entryBg,
        cursor: "pointer",
        width: "100%",
        textAlign: "left",
        transition: "background 0.12s",
      }}
    >
      <span
        style={{
          fontSize: "0.48rem",
          color: C.entryIcon,
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        ✦
      </span>
      <div style={{ minWidth: 0 }}>
        <p
          style={{
            fontSize: "0.79rem",
            fontWeight: 700,
            color: C.entryLabel,
            margin: 0,
          }}
        >
          {label}
        </p>
        <p
          style={{
            fontSize: "0.68rem",
            color: C.entrySub,
            margin: "0.05rem 0 0",
          }}
        >
          {sub}
        </p>
      </div>
      <span
        style={{
          marginLeft: "auto",
          fontSize: "0.68rem",
          color: C.entryArrow,
          flexShrink: 0,
        }}
      >
        →
      </span>
    </button>
  );
}

function HBtn({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: "0.38rem 0.8rem",
        borderRadius: "0.5rem",
        border: `1px solid ${active ? C.hbtnOnBorder : "rgba(88,62,22,0.48)"}`,
        background: active ? C.hbtnOnBg : hover ? C.hbtnHoverBg : C.hbtnBg,
        color: active ? C.hbtnOnColor : hover ? C.hbtnHoverColor : C.hbtnColor,
        fontSize: "0.74rem",
        cursor: "pointer",
        transition: "background 0.14s, color 0.14s",
      }}
    >
      {children}
    </button>
  );
}

function NavBtn({
  children,
  gold,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  gold?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => !disabled && setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: "0.38rem 0.85rem",
        borderRadius: "0.5rem",
        border: `1px solid ${gold ? C.nbtnGoldBorder : "rgba(88,62,22,0.48)"}`,
        background: gold
          ? hover
            ? C.nbtnGoldHoverBg
            : C.nbtnGoldBg
          : hover
            ? C.nbtnHoverBg
            : C.nbtnBg,
        color: gold ? C.nbtnGoldColor : hover ? C.nbtnHoverColor : C.nbtnColor,
        fontSize: "0.74rem",
        fontWeight: gold ? 600 : 400,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.25 : 1,
        transition: "background 0.12s, opacity 0.14s",
      }}
    >
      {children}
    </button>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function ProspectSpellbook({ onClose }: Props) {
  const [currentPage, setCurrentPage] = useState<PageId>("summary");
  const [turning, setTurning] = useState<"next" | "prev" | null>(null);
  const [rotY, setRotY] = useState(0);
  const [rotX, setRotX] = useState(0);
  const [hovering, setHovering] = useState(false);
  const bookRef = useRef<HTMLDivElement>(null);

  const currentEntry = useMemo(
    () =>
      currentPage === "summary"
        ? null
        : (spellbookEntries.find((e) => e.id === currentPage) ?? null),
    [currentPage],
  );
  const currentIndex = currentEntry
    ? spellbookEntries.findIndex((e) => e.id === currentEntry.id)
    : -1;

  function turnPage(dir: "next" | "prev") {
    if (turning) return;
    setTurning(dir);
    setTimeout(() => {
      if (dir === "next") {
        if (currentPage === "summary") setCurrentPage(spellbookEntries[0].id);
        else if (currentEntry && currentIndex < spellbookEntries.length - 1)
          setCurrentPage(spellbookEntries[currentIndex + 1].id);
      } else {
        if (currentEntry) {
          if (currentIndex <= 0) setCurrentPage("summary");
          else setCurrentPage(spellbookEntries[currentIndex - 1].id);
        }
      }
      setTurning(null);
    }, 420);
  }

  const canGoNext =
    currentPage === "summary" ||
    (currentEntry !== null && currentIndex < spellbookEntries.length - 1);
  const canGoPrev = currentPage !== "summary" && currentEntry !== null;

  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = bookRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRotY(clamp(((e.clientX - r.left) / r.width - 0.5) * 5, -4, 4));
    setRotX(clamp(-((e.clientY - r.top) / r.height - 0.5) * 3, -2.5, 2.5));
  }

  // ─── Contenu des pages (100% inline) ─────────────────────────────────────

  const leftContent =
    currentPage === "summary" ? (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          gap: 0,
        }}
      >
        <Eyebrow>Grimoire · Studio Selen</Eyebrow>
        <PageH>Prestations</PageH>
        <BodyP>
          Référence rapide pendant l'appel.
          <br />
          Sélectionne une offre pour l'ouvrir.
        </BodyP>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.38rem",
            marginTop: "0.8rem",
          }}
        >
          {spellbookEntries.map((e) => (
            <EntryBtn
              key={e.id}
              label={e.label}
              sub={e.subtitle ?? ""}
              onClick={() => setCurrentPage(e.id)}
            />
          ))}
        </div>
        <p
          style={{
            marginTop: "auto",
            paddingTop: "0.9rem",
            fontSize: "0.7rem",
            fontStyle: "italic",
            color: C.italic,
          }}
        >
          Aide à la présentation des offres
        </p>
      </div>
    ) : currentEntry ? (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <Eyebrow>Prestation</Eyebrow>
        <PageH>{currentEntry.leftTitle}</PageH>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.6rem",
            flex: 1,
          }}
        >
          {currentEntry.leftText.map((line, i) => (
            <BodyP key={i}>{line}</BodyP>
          ))}
        </div>
      </div>
    ) : null;

  const rightContent =
    currentPage === "summary" ? (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <Eyebrow>Guide d'utilisation</Eyebrow>
        <PageH>Comment s'en servir</PageH>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.6rem",
            flex: 1,
          }}
        >
          <BodyP>
            Le grimoire s'ouvre pendant votre appel. Naviguez entre les offres
            selon le profil du prospect.
          </BodyP>
          <BodyP>
            Commencez par le sommaire, puis ouvrez l'offre la plus adaptée au
            besoin exprimé.
          </BodyP>
          <BodyP>
            Identifiez d'abord si le prospect est en phase « premier NDA » ou
            déjà actif — cela oriente vers{" "}
            <strong style={{ color: C.bodyBold, fontWeight: 700 }}>
              Review
            </strong>{" "}
            ou{" "}
            <strong style={{ color: C.bodyBold, fontWeight: 700 }}>
              Prepa
            </strong>
            .
          </BodyP>
        </div>
        <TipBox label="Astuce">
          <p
            style={{
              fontSize: "0.8rem",
              lineHeight: 1.65,
              color: C.body,
              margin: 0,
            }}
          >
            Les boutons de navigation en bas permettent de passer d'une offre à
            l'autre sans revenir au sommaire.
          </p>
        </TipBox>
      </div>
    ) : currentEntry ? (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <Eyebrow>Détails de l'offre</Eyebrow>
        <PageH>{currentEntry.rightTitle}</PageH>
        <ul
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
            margin: 0,
            padding: 0,
            listStyle: "none",
          }}
        >
          {currentEntry.rightText.map((line, i) => (
            <li
              key={i}
              style={{
                display: "flex",
                gap: "0.5rem",
                alignItems: "flex-start",
              }}
            >
              <span
                style={{
                  color: C.entryIcon,
                  fontSize: "0.48rem",
                  flexShrink: 0,
                  marginTop: "0.44rem",
                }}
              >
                ✦
              </span>
              <span
                style={{ fontSize: "0.82rem", lineHeight: 1.78, color: C.body }}
              >
                {line}
              </span>
            </li>
          ))}
        </ul>
        <TipBox label="Tarif">
          <p
            style={{
              fontFamily: "var(--font-cinzel)",
              fontSize: "0.9rem",
              fontWeight: 700,
              color: C.price,
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            {currentEntry.price || "—"}
          </p>
          {currentEntry.comingSoon && (
            <p
              style={{
                fontSize: "0.72rem",
                color: C.muted,
                marginTop: "0.2rem",
              }}
            >
              Offre prévue prochainement.
            </p>
          )}
        </TipBox>
      </div>
    ) : null;

  // ─── Rendu ────────────────────────────────────────────────────────────────

  const bookTransform = hovering
    ? `perspective(1200px) rotateY(${rotY}deg) rotateX(${rotX}deg)`
    : "perspective(1200px) rotateY(0deg) rotateX(0deg)";

  const PAGE_H = 430;
  const PAGE_W = "min(720px, calc(100vw - 80px))";

  // Classes d'animation viennent de globals.css (sb-flip-right / sb-flip-left)
  const leftClass = turning === "prev" ? "sb-flip-left" : "";
  const rightClass = turning === "next" ? "sb-flip-right" : "";

  return (
    <div
      style={{
        marginBottom: "1.25rem",
        borderRadius: "0.875rem",
        border: `1px solid ${C.wrapBorder}`,
        background: C.wrap,
        padding: "1.25rem 1.25rem 1rem",
        boxShadow: "0 24px 70px rgba(0,0,0,0.65)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap" as const,
          gap: "0.75rem",
          marginBottom: "1.25rem",
        }}
      >
        <div>
          <h2
            style={{
              fontFamily: "var(--font-cinzel)",
              fontSize: "0.92rem",
              fontWeight: 600,
              color: C.headerTitle,
              textTransform: "uppercase" as const,
              letterSpacing: "0.06em",
              margin: 0,
            }}
          >
            📖 Grimoire des prestations
          </h2>
          <p
            style={{
              fontSize: "0.72rem",
              color: C.headerSub,
              marginTop: "0.1rem",
            }}
          >
            Référence rapide · Studio Selen
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <HBtn
            active={currentPage === "summary"}
            onClick={() => setCurrentPage("summary")}
          >
            Sommaire
          </HBtn>
          <HBtn onClick={onClose}>Fermer ✕</HBtn>
        </div>
      </div>

      {/* Scène livre */}
      <div
        style={{
          position: "relative",
          display: "flex",
          justifyContent: "center",
          padding: "1rem 0 2.25rem",
        }}
      >
        {/* Ombre portée */}
        <div
          style={{
            position: "absolute",
            bottom: "0.25rem",
            left: "50%",
            transform: "translateX(-50%)",
            width: "68%",
            height: "20px",
            borderRadius: "50%",
            background: "rgba(0,0,0,0.62)",
            filter: "blur(14px)",
          }}
        />

        {/* Livre avec tilt */}
        <div
          ref={bookRef}
          onMouseMove={onMouseMove}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => {
            setHovering(false);
            setRotY(0);
            setRotX(0);
          }}
          style={{
            position: "relative",
            display: "flex",
            alignItems: "flex-start",
            transformStyle: "preserve-3d",
            transform: bookTransform,
            transition: hovering
              ? "transform 0.08s ease-out"
              : "transform 0.45s ease-out",
          }}
        >
          {/* Dos du livre */}
          <div
            style={{
              width: 24,
              height: PAGE_H,
              flexShrink: 0,
              background: C.spine,
              borderRadius: "3px 0 0 3px",
              border: "1px solid #160d04",
              borderRight: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow:
                "-3px 0 10px rgba(0,0,0,0.65), inset 1px 0 0 rgba(255,200,100,0.05)",
            }}
          >
            <span
              style={{
                writingMode: "vertical-rl",
                transform: "rotate(180deg)",
                fontSize: "0.52rem",
                letterSpacing: "0.2em",
                textTransform: "uppercase" as const,
                color: "rgba(188,146,52,0.42)",
                fontFamily: "var(--font-cinzel)",
              }}
            >
              Grimoire · Selen
            </span>
          </div>

          {/* Tranche pages droite */}
          <div
            style={{
              position: "absolute",
              right: -5,
              top: 2,
              width: 6,
              height: PAGE_H - 4,
              background: C.pagesEdge,
              borderRadius: "0 2px 2px 0",
              boxShadow: "2px 0 5px rgba(0,0,0,0.4)",
            }}
          />

          {/* Corps du livre */}
          <div
            style={{
              display: "flex",
              height: PAGE_H,
              width: PAGE_W,
              overflow: "hidden",
              boxShadow:
                "0 16px 50px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,220,150,0.04), inset 0 -1px 0 rgba(0,0,0,0.2)",
            }}
          >
            {/* Page gauche */}
            <div
              className={leftClass}
              style={{
                flex: 1,
                position: "relative",
                overflow: "hidden",
                background: C.pageL,
                boxShadow: "inset -5px 0 14px rgba(75,40,8,0.1)",
              }}
            >
              {/* Grain */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  opacity: 0.05,
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)'/%3E%3C/svg%3E")`,
                  mixBlendMode: "multiply",
                }}
              />
              {/* N° page */}
              <span
                style={{
                  position: "absolute",
                  bottom: 11,
                  left: 16,
                  fontSize: "0.58rem",
                  color: C.pgNum,
                  fontFamily: "var(--font-cinzel)",
                  letterSpacing: "0.06em",
                }}
              >
                {currentPage === "summary" ? "i" : String(currentIndex * 2 + 1)}
              </span>
              {/* Marge */}
              <div
                style={{
                  position: "absolute",
                  top: 16,
                  bottom: 16,
                  right: 13,
                  width: 1,
                  background: C.marginLine,
                }}
              />
              {/* Contenu */}
              <div
                style={{
                  position: "relative",
                  zIndex: 1,
                  padding: "1.4rem 1.3rem 1.6rem",
                  height: "100%",
                  overflowY: "auto",
                }}
              >
                {leftContent}
              </div>
            </div>

            {/* Reliure centrale */}
            <div
              style={{
                width: 13,
                flexShrink: 0,
                background: C.gutter,
                display: "flex",
                flexDirection: "row",
                justifyContent: "center",
                gap: 3,
                alignItems: "stretch",
                boxShadow:
                  "-2px 0 6px rgba(0,0,0,0.3), 2px 0 6px rgba(0,0,0,0.3)",
              }}
            >
              <div style={{ width: 1, background: C.gutterLine }} />
              <div style={{ width: 1, background: C.gutterLine }} />
            </div>

            {/* Page droite */}
            <div
              className={rightClass}
              style={{
                flex: 1,
                position: "relative",
                overflow: "hidden",
                background: C.pageR,
                boxShadow: "inset 5px 0 14px rgba(75,40,8,0.1)",
              }}
            >
              {/* Grain */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  opacity: 0.05,
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)'/%3E%3C/svg%3E")`,
                  mixBlendMode: "multiply",
                }}
              />
              {/* N° page */}
              <span
                style={{
                  position: "absolute",
                  bottom: 11,
                  right: 16,
                  fontSize: "0.58rem",
                  color: C.pgNum,
                  fontFamily: "var(--font-cinzel)",
                  letterSpacing: "0.06em",
                }}
              >
                {currentPage === "summary"
                  ? "ii"
                  : String(currentIndex * 2 + 2)}
              </span>
              {/* Marge */}
              <div
                style={{
                  position: "absolute",
                  top: 16,
                  bottom: 16,
                  left: 13,
                  width: 1,
                  background: C.marginLine,
                }}
              />
              {/* Contenu */}
              <div
                style={{
                  position: "relative",
                  zIndex: 1,
                  padding: "1.4rem 1.3rem 1.6rem",
                  height: "100%",
                  overflowY: "auto",
                }}
              >
                {rightContent}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap" as const,
          gap: "0.6rem",
          marginTop: "0.9rem",
          paddingTop: "0.85rem",
          borderTop: "1px solid rgba(88,62,22,0.22)",
        }}
      >
        <span
          style={{
            fontSize: "0.7rem",
            color: C.navIndicator,
            fontFamily: "var(--font-cinzel)",
            letterSpacing: "0.05em",
          }}
        >
          {currentPage === "summary"
            ? "Sommaire"
            : `${currentEntry?.label ?? ""} · ${currentIndex + 1} / ${spellbookEntries.length}`}
        </span>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <NavBtn
            disabled={!canGoPrev || !!turning}
            onClick={() => turnPage("prev")}
          >
            ← Précédent
          </NavBtn>
          <NavBtn
            gold
            disabled={!canGoNext || !!turning}
            onClick={() => turnPage("next")}
          >
            Suivant →
          </NavBtn>
        </div>
      </div>
    </div>
  );
}
