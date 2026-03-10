"use client";

import { useMemo, useState } from "react";
import { spellbookEntries } from "../lib/spellbookData";

type Props = {
  onClose: () => void;
};

type PageId = "summary" | (typeof spellbookEntries)[number]["id"];

function topButtonClass(active: boolean) {
  return active
    ? "rounded-xl bg-amber-700 px-3 py-2 text-xs font-medium text-white shadow"
    : "rounded-xl border border-amber-700/30 bg-[#2b211b] px-3 py-2 text-xs text-amber-100 hover:bg-[#3a2c24] transition";
}

function navButtonClass(primary = false) {
  return primary
    ? "rounded-xl bg-amber-700 px-3 py-2 text-xs font-medium text-white shadow hover:bg-amber-600 transition"
    : "rounded-xl border border-amber-700/30 bg-[#2b211b] px-3 py-2 text-xs text-amber-100 hover:bg-[#3a2c24] transition";
}

export default function ProspectSpellbook({ onClose }: Props) {
  const [currentPage, setCurrentPage] = useState<PageId>("summary");

  const currentEntry = useMemo(() => {
    if (currentPage === "summary") return null;
    return spellbookEntries.find((entry) => entry.id === currentPage) ?? null;
  }, [currentPage]);

  const currentIndex = currentEntry
    ? spellbookEntries.findIndex((entry) => entry.id === currentEntry.id)
    : -1;

  function goPrev() {
    if (!currentEntry) return;
    if (currentIndex <= 0) {
      setCurrentPage("summary");
      return;
    }
    setCurrentPage(spellbookEntries[currentIndex - 1].id);
  }

  function goNext() {
    if (currentPage === "summary") {
      setCurrentPage(spellbookEntries[0].id);
      return;
    }
    if (!currentEntry) return;
    if (currentIndex >= spellbookEntries.length - 1) return;
    setCurrentPage(spellbookEntries[currentIndex + 1].id);
  }

  return (
    <div className="mb-4 rounded-[30px] border border-amber-700/20 bg-[rgba(20,14,10,0.88)] p-4 shadow-[0_25px_90px_rgba(0,0,0,0.5)] backdrop-blur-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold uppercase tracking-wide text-amber-100">
            📖 Grimoire des prestations
          </h2>
          <p className="text-xs text-amber-300/70">
            Référence rapide pendant l’appel
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCurrentPage("summary")}
            className={topButtonClass(currentPage === "summary")}
          >
            Sommaire
          </button>
          <button
            type="button"
            onClick={onClose}
            className={topButtonClass(false)}
          >
            Fermer
          </button>
        </div>
      </div>

      <div className="spellbook-wrap relative">
        <div className="spellbook-shadow pointer-events-none absolute inset-x-8 bottom-[-18px] h-10 rounded-full bg-black/40 blur-2xl" />

        <div className="spellbook-shell relative overflow-hidden rounded-[34px] border border-amber-500/15 bg-[#3a2b21] p-3 shadow-[inset_0_1px_0_rgba(255,220,150,0.08),0_20px_50px_rgba(0,0,0,0.45)]">
          <div className="pointer-events-none absolute inset-0 rounded-[34px] bg-[radial-gradient(circle_at_top,rgba(255,220,160,0.08),transparent_35%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_25%)]" />

          <div className="pointer-events-none absolute inset-y-5 left-1/2 hidden w-[18px] -translate-x-1/2 rounded-full bg-[linear-gradient(180deg,rgba(70,43,29,0.9),rgba(33,20,13,0.95),rgba(70,43,29,0.9))] shadow-[inset_0_0_8px_rgba(0,0,0,0.45)] lg:block" />

          <div className="pointer-events-none absolute inset-y-6 left-[calc(50%-22px)] hidden w-px bg-gradient-to-b from-transparent via-amber-950/80 to-transparent lg:block" />
          <div className="pointer-events-none absolute inset-y-6 left-[calc(50%+21px)] hidden w-px bg-gradient-to-b from-transparent via-amber-950/80 to-transparent lg:block" />

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="page-outer rounded-[28px] bg-[linear-gradient(180deg,#7a5d47_0%,#6f533f_100%)] p-[1px] shadow-[inset_0_0_0_1px_rgba(255,235,190,0.05)]">
              <div className="page-float page-inner min-h-[410px] rounded-[27px] border border-[#5d4332] bg-[radial-gradient(circle_at_top_left,rgba(255,250,235,0.65),rgba(244,226,194,0.92)_18%,rgba(231,209,176,0.98)_55%,rgba(214,188,153,0.98)_100%)] px-6 py-5 text-[#3a2718] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),inset_0_-20px_35px_rgba(102,62,29,0.07)]">
                {currentPage === "summary" ? (
                  <div className="text-float flex h-full flex-col">
                    <p className="mb-3 text-[11px] uppercase tracking-[0.28em] text-[#8c5f3d]/80">
                      Sommaire
                    </p>

                    <h3 className="mb-2 text-[24px] font-semibold text-[#4b2f1a]">
                      Prestations
                    </h3>

                    <p className="mb-5 text-sm leading-relaxed text-[#6c4a2f]">
                      Clique sur une offre pour afficher ses détails.
                    </p>

                    <div className="space-y-3">
                      {spellbookEntries.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => setCurrentPage(entry.id)}
                          className="block w-full rounded-2xl border border-[#8f6a4f]/35 bg-[rgba(255,248,235,0.36)] px-4 py-3 text-left shadow-sm transition hover:bg-[rgba(255,248,235,0.58)]"
                        >
                          <p className="text-sm font-semibold text-[#4a2d18]">
                            ✨ {entry.label}
                          </p>
                          <p className="mt-1 text-xs text-[#6d4a30]">
                            {entry.subtitle}
                          </p>
                        </button>
                      ))}
                    </div>

                    <div className="mt-auto pt-5 text-xs italic text-[#7a5739]">
                      Grimoire d’aide à la présentation des offres
                    </div>
                  </div>
                ) : currentEntry ? (
                  <div className="text-float flex h-full flex-col">
                    <p className="mb-3 text-[11px] uppercase tracking-[0.28em] text-[#8c5f3d]/80">
                      Prestation
                    </p>

                    <h3 className="mb-4 text-[24px] font-semibold leading-tight text-[#4b2f1a]">
                      {currentEntry.leftTitle}
                    </h3>

                    <div className="space-y-3 text-sm leading-7 text-[#4e341f]">
                      {currentEntry.leftText.map((line, index) => (
                        <p key={index}>{line}</p>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="page-outer rounded-[28px] bg-[linear-gradient(180deg,#7a5d47_0%,#6f533f_100%)] p-[1px] shadow-[inset_0_0_0_1px_rgba(255,235,190,0.05)]">
              <div className="page-float page-inner min-h-[410px] rounded-[27px] border border-[#5d4332] bg-[radial-gradient(circle_at_top_right,rgba(255,250,235,0.65),rgba(244,226,194,0.92)_18%,rgba(231,209,176,0.98)_55%,rgba(214,188,153,0.98)_100%)] px-6 py-5 text-[#3a2718] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),inset_0_-20px_35px_rgba(102,62,29,0.07)]">
                {currentPage === "summary" ? (
                  <div className="text-float flex h-full flex-col">
                    <p className="mb-3 text-[11px] uppercase tracking-[0.28em] text-[#8c5f3d]/80">
                      Aperçu
                    </p>

                    <h3 className="mb-4 text-[24px] font-semibold text-[#4b2f1a]">
                      Utilisation
                    </h3>

                    <div className="space-y-4 text-sm leading-7 text-[#4e341f]">
                      <p>
                        Le grimoire reste visible sur la partie gauche de la
                        fiche pendant que la zone de notes reste libre à droite.
                      </p>
                      <p>
                        Il sert de référence rapide pour retrouver les
                        prestations, leurs avantages et leurs tarifs sans perdre
                        le fil de l’appel.
                      </p>
                      <p>
                        La navigation permet de passer vite d’une offre à
                        l’autre selon le profil du prospect.
                      </p>
                    </div>

                    <div className="mt-auto rounded-2xl border border-[#8f6a4f]/30 bg-[rgba(255,248,235,0.32)] p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-[#8c5f3d]/80">
                        Astuce
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[#5a3b24]">
                        Commence par le sommaire, puis ouvre l’offre la plus
                        adaptée au besoin détecté.
                      </p>
                    </div>
                  </div>
                ) : currentEntry ? (
                  <div className="text-float flex h-full flex-col">
                    <p className="mb-3 text-[11px] uppercase tracking-[0.28em] text-[#8c5f3d]/80">
                      Détails
                    </p>

                    <h3 className="mb-4 text-[24px] font-semibold leading-tight text-[#4b2f1a]">
                      {currentEntry.rightTitle}
                    </h3>

                    <ul className="mb-5 space-y-3 text-sm leading-7 text-[#4e341f]">
                      {currentEntry.rightText.map((line, index) => (
                        <li key={index} className="flex gap-3">
                          <span className="mt-[2px] text-[#8a5a34]">✦</span>
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-auto rounded-2xl border border-[#8f6a4f]/30 bg-[rgba(255,248,235,0.32)] p-4 shadow-sm">
                      <p className="text-xs uppercase tracking-[0.2em] text-[#8c5f3d]/80">
                        Tarif
                      </p>
                      <p className="mt-2 text-xl font-semibold text-[#4b2f1a]">
                        {currentEntry.price || "—"}
                      </p>
                      {currentEntry.comingSoon && (
                        <p className="mt-2 text-xs text-[#6d4a30]">
                          Offre prévue plus tard.
                        </p>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-amber-300/75">
              {currentPage === "summary"
                ? "Sommaire du grimoire"
                : `${currentIndex + 1} / ${spellbookEntries.length}`}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={goPrev}
                className={navButtonClass()}
              >
                ← Précédent
              </button>
              <button
                type="button"
                onClick={goNext}
                className={navButtonClass(true)}
              >
                Suivant →
              </button>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .spellbook-wrap {
          perspective: 1400px;
        }

        .spellbook-shell {
          animation: floatBook 7s ease-in-out infinite;
          transform-origin: center center;
        }

        .page-float {
          animation: floatPage 7s ease-in-out infinite;
        }

        .text-float {
          animation: floatText 7s ease-in-out infinite;
        }

        @keyframes floatBook {
          0% {
            transform: translateY(0px) rotateX(0deg);
          }
          50% {
            transform: translateY(-5px) rotateX(0.4deg);
          }
          100% {
            transform: translateY(0px) rotateX(0deg);
          }
        }

        @keyframes floatPage {
          0% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-3px);
          }
          100% {
            transform: translateY(0px);
          }
        }

        @keyframes floatText {
          0% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-2px);
          }
          100% {
            transform: translateY(0px);
          }
        }
      `}</style>
    </div>
  );
}
