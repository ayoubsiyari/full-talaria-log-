      {newSessCalOpen && (() => {
        const selIso = newSessCalTarget === "start" ? newSessStart : newSessEnd;
        const selDate = selIso ? new Date(selIso.split("T")[0] + "T00:00:00") : null;
        const selY = selDate ? selDate.getFullYear() : newSessCalViewY;
        const selMo = selDate ? selDate.getMonth() : newSessCalViewM;
        const selD = selDate ? selDate.getDate() : 0;
        const MON_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
        const cellSx = (isSel: boolean, isH: boolean, disabled: boolean) => ({
          textAlign: "center" as const,
          cursor: disabled ? "not-allowed" : "default",
          fontFamily: F,
          background: isSel ? c.acL : isH ? "rgba(140,160,255,0.12)" : "transparent",
          color: isSel ? "#fff" : isH ? c.acL : c.ts,
          opacity: disabled ? 0.28 : 1,
          transition: "background 0.08s,color 0.08s",
        });
        const pickIso = (iso: string) => {
          const d = new Date(iso.split("T")[0] + "T00:00:00");
          const label = `${String(d.getDate()).padStart(2, "0")}-${MON_SHORT[d.getMonth()]}-${d.getFullYear()}`;
          if (newSessCalTarget === "start") {
            setNewSessStart(iso);
            setNewSessStartInput(label);
            if (newSessEnd && newSessEnd < iso) {
              setNewSessEnd("");
              setNewSessEndInput("");
            }
          } else if (!newSessStart || iso >= newSessStart) {
            setNewSessEnd(iso);
            setNewSessEndInput(label);
          }
          setNewSessActivePreset(null);
          setNewSessCalOpen(false);
          setNewSessCalMode("days");
        };
        const NavBtn = ({ onClick, label }: { onClick: () => void; label: string }) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            style={{ background: "transparent", border: "none", color: c.ts, cursor: "default", padding: "0 7px", fontSize: 16, fontFamily: F, lineHeight: 1 }}
          >
            {label}
          </button>
        );
        return (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: newSessCalPos.top,
              left: newSessCalPos.left,
              width: newSessCalPos.width || 220,
              zIndex: 100002,
              background: c.sf,
              border: `1px solid ${c.brH}`,
              boxShadow: `0 12px 40px rgba(0,0,0,0.8),0 0 14px ${c.acG}`,
              fontFamily: F,
              animation: "tlrPopIn 0.12s ease both",
            }}
          >
            <div style={{ height: 2, background: `linear-gradient(90deg,${c.ac},${c.acL},${c.ac})` }} />
            <div style={{ display: "flex", alignItems: "center", padding: "7px 10px 6px" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: c.tx, flex: 1 }}>
                {newSessCalTarget === "start" ? "Start date" : "End date"}
              </span>
              <div
                onClick={() => {
                  setNewSessCalOpen(false);
                  setNewSessCalMode("days");
                }}
                style={{ cursor: "default", padding: 3, display: "flex", alignItems: "center" }}
              >
                <I n="x" s={14} cl={c.ts} />
              </div>
            </div>
            <div style={{ height: 1, background: c.br }} />
            <div style={{ display: "flex", alignItems: "center", padding: "5px 4px", borderBottom: `1px solid ${c.br}` }}>
              {newSessCalMode === "days" && (
                <NavBtn
                  label="‹"
                  onClick={() => {
                    const d = new Date(newSessCalViewY, newSessCalViewM - 1, 1);
                    setNewSessCalViewY(d.getFullYear());
                    setNewSessCalViewM(d.getMonth());
                  }}
                />
              )}
              {newSessCalMode === "months" && <NavBtn label="‹" onClick={() => setNewSessCalViewY((y) => y - 1)} />}
              {newSessCalMode === "years" && <NavBtn label="‹" onClick={() => setNewSessCalYearBase((b) => b - 12)} />}
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                {(newSessCalMode === "days" || newSessCalMode === "months") && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setNewSessCalMode((m) => (m === "months" ? "days" : "months"));
                    }}
                    style={{ fontSize: 12, fontWeight: 700, color: newSessCalMode === "months" ? c.acL : c.tx, cursor: "default", padding: "2px 4px" }}
                  >
                    {MON_SHORT[newSessCalViewM]}
                  </span>
                )}
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    if (newSessCalMode !== "years") {
                      setNewSessCalYearBase(Math.floor(newSessCalViewY / 12) * 12);
                      setNewSessCalMode("years");
                    } else {
                      setNewSessCalMode("days");
                    }
                  }}
                  style={{ fontSize: 12, fontWeight: 700, color: newSessCalMode === "years" ? c.acL : c.tx, cursor: "default", padding: "2px 4px" }}
                >
                  {newSessCalMode === "years" ? `${newSessCalYearBase} – ${newSessCalYearBase + 11}` : newSessCalViewY}
                </span>
              </div>
              {newSessCalMode === "days" && (
                <NavBtn
                  label="›"
                  onClick={() => {
                    const d = new Date(newSessCalViewY, newSessCalViewM + 1, 1);
                    setNewSessCalViewY(d.getFullYear());
                    setNewSessCalViewM(d.getMonth());
                  }}
                />
              )}
              {newSessCalMode === "months" && <NavBtn label="›" onClick={() => setNewSessCalViewY((y) => y + 1)} />}
              {newSessCalMode === "years" && <NavBtn label="›" onClick={() => setNewSessCalYearBase((b) => b + 12)} />}
            </div>
            {newSessCalMode === "days" && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", padding: "5px 6px 2px" }}>
                  {DOW.map((d) => (
                    <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: c.tm }}>
                      {d}
                    </div>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", padding: "0 6px 8px", gap: 2 }}>
                  {Array.from({ length: new Date(newSessCalViewY, newSessCalViewM, 1).getDay() }).map((_, i) => (
                    <div key={`e${i}`} />
                  ))}
                  {Array.from({ length: new Date(newSessCalViewY, newSessCalViewM + 1, 0).getDate() }).map((_, i) => {
                    const day = i + 1;
                    const mo = String(newSessCalViewM + 1).padStart(2, "0");
                    const dy = String(day).padStart(2, "0");
                    const iso = `${newSessCalViewY}-${mo}-${dy}`;
                    const disabled = isSessCalDayDisabled(iso);
                    const isSel = selY === newSessCalViewY && selMo === newSessCalViewM && selD === day;
                    const isH = !disabled && hov === `scal-${iso}`;
                    return (
                      <div
                        key={day}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (disabled) return;
                          pickIso(iso);
                        }}
                        onMouseEnter={() => {
                          if (!disabled) setHov(`scal-${iso}`);
                        }}
                        onMouseLeave={() => setHov(null)}
                        style={{ ...cellSx(isSel, isH, disabled), fontSize: 12, padding: "4px 0", fontWeight: isSel ? 700 : 400 }}
                      >
                        {day}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            {newSessCalMode === "months" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", padding: "8px 6px", gap: 4 }}>
                {MON_SHORT.map((m, i) => (
                  <div
                    key={m}
                    onClick={(e) => {
                      e.stopPropagation();
                      setNewSessCalViewM(i);
                      setNewSessCalMode("days");
                    }}
                    onMouseEnter={() => setHov(`scal-m-${i}`)}
                    onMouseLeave={() => setHov(null)}
                    style={{ ...cellSx(selMo === i && selY === newSessCalViewY, hov === `scal-m-${i}`, false), fontSize: 11, padding: "6px 0" }}
                  >
                    {m}
                  </div>
                ))}
              </div>
            )}
            {newSessCalMode === "years" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", padding: "8px 6px", gap: 4 }}>
                {Array.from({ length: 12 }).map((_, i) => {
                  const y = newSessCalYearBase + i;
                  return (
                    <div
                      key={y}
                      onClick={(e) => {
                        e.stopPropagation();
                        setNewSessCalViewY(y);
                        setNewSessCalMode("days");
                      }}
                      onMouseEnter={() => setHov(`scal-y-${y}`)}
                      onMouseLeave={() => setHov(null)}
                      style={{ ...cellSx(selY === y, hov === `scal-y-${y}`, false), fontSize: 11, padding: "6px 0" }}
                    >
                      {y}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}
      <style>{`
        @keyframes tlrPopIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </>
  );
}
