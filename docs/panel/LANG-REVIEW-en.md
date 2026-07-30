# English Localization Review — OracleTuner Windows Installer

**Date**: 2026-07-31  
**Reviewer**: Localization Specialist (Writer Agent)  
**Target File**: `installer/lang.ps1` (English strings block, lines 76–135)  
**Context**: Oracle SQL tuning tool for developers/DBAs; Windows installer conventions apply.

---

## Review Summary

Total strings reviewed: **59**  
Issues found: **13**  
Action required: **Minor refinements for clarity, consistency, length, and Windows UI conventions.**

---

## Detailed Findings

| Line | Key | Current English | Suggestion | Reason |
|------|-----|-----------------|------------|--------|
| 91 | `step1.intro` | "This installs the Oracle SQL tuning workbench. To continue, please agree to the MIT license below." | "Install Oracle SQL tuning workbench. To continue, agree to the MIT license below." | Remove unnecessary politeness ("please"); use imperative form (Windows installer style). |
| 95 | `license.authoritativeNote` | "The English original below is the authoritative text. This summary is a translation aid only and has no legal effect." | "English original is authoritative. This summary is a translation aid only." | Tighten phrasing for UI display; remove redundancy. Current text wraps awkwardly in narrow dialogs. |
| 97 | `step2.folderDialogDescription` | "Select the folder to install to" | "Select the destination folder." | Add period; fix awkward "to install to" phrasing. Standard Windows dialog style. |
| 98 | `step2.programFilesWarning` | "Installing under Program Files requires administrator rights.`r`nConnection info, SQL history, and other data are always stored in %LOCALAPPDATA%\OracleTuner instead of this folder, so it stays safe regardless of this folder's write permissions." | "⚠ Installing under Program Files requires administrator rights.`r`nConnection info, SQL history, and data are stored in %LOCALAPPDATA%\OracleTuner (not this folder), so it's safe regardless of write permissions." | (1) Add ⚠ icon for consistency with Korean locale. (2) Shorten to prevent truncation (current ~150 chars, may wrap in WinForms). (3) Simplify "other data" → "data"; tighten final clause. |
| 99 | `step2.pathRequiredWarning` | "Please enter an installation path." | "Enter an installation path." | Remove unnecessary politeness; use direct imperative (error message context). |
| 100 | `step3.javaLabel` | "Choose how Java will run. (Reuses the existing discovery logic instead of reimplementing JDK handling.)" | "Choose how Java will run." | Parenthetical is overly technical and rarely needed in UI. If explanation is essential, simplify to: "(reuses existing discovery logic)". Current phrasing may confuse end-users. |
| 105 | `step3.bundledJava` | "Use bundled JRE (only selectable if included in this distribution)" | "Use bundled JRE (if available)" | Shorten parenthetical for UI clarity. "If available" is shorter and conveys same meaning to installer users. |
| 106 | `step3.javaFolderDialogDescription` | "Select the JDK or JRE home directory (the parent of the folder containing bin\java.exe)" | "Select the JDK or JRE home directory (parent of the bin\ folder)." | Add period; clarify confusing phrase "parent of the folder containing bin\java.exe" → "parent of the bin\ folder" (more concise and clearer). |
| 111 | `step4.portLabel` | "Specify the port the server will use. (Checked against 127.0.0.1 only, to avoid firewall prompts.)" | "Specify the port the server will use. (Checks against 127.0.0.1 only; avoids firewall dialogs.)" | Simplify parenthetical: change "Checked...to avoid" → "Checks...avoids" (active voice, shorter). "Dialogs" preferred over "prompts" in Windows terminology. |
| 114 | `step4.nodeUnavailableFind` | "Could not search because node could not be run." | "Could not find ports because node could not be run." | Align terminology with line 112 (`step4.findPort` = "Find available port"). Use "find" consistently, not "search". |
| 118 | `step4.nodeUnavailableTest` | "Could not check because node could not be run." | "Could not test port because node could not be run." | Align terminology: line 113 button is "Test", so error should also say "test", not "check". Consistency across UI. |
| 127 | `step5.summary.dataNote` | "(Connection info and SQL history are stored here, not in the install folder, so it is safe to install under Program Files.)" | "(Stored here, not in install folder; safe for Program Files installations.)" | Tighten for UI summary display. Shorten verbose clause; use active noun phrase. |
| 133 | `uninstall.dataConfirmBody` | "Do you also want to delete the saved connection info, SQL history, and settings?`r`nLocation: {0}`r`n`r`nChoose [Yes] to permanently delete the data as well (cannot be undone).`r`nChoose [No] to remove only the program and keep the data (you can pick up where you left off if you reinstall later)." | "Delete saved connection info, SQL history, and settings?`r`nLocation: {0}`r`n`r`nYes: Delete all data (cannot undo).`r`nNo: Keep data for future reinstall." | (1) Remove "also" and "Do you want to" — implied by dialog context. (2) Remove [Yes] / [No] brackets — non-standard Windows convention. (3) Drastically shorten entire text to prevent dialog truncation. Second paragraph is verbose ("pick up where you left off") — condense to "(for future reinstall)". |

---

## Strings Rated as Appropriate

The following meet Windows installer conventions and need no changes:

- **Button labels** (`common.*`): Cancel, Back, Next, Install, Close, Browse — all standard.
- **Progress steps** (`step.progress.*`): Consistent dash separator; clear numbering.
- **Technical accuracy** (JDK/JRE, port ranges, paths): Correct terminology.
- **Summary labels** (`step5.summary.*`): Concise, clear format.
- **License text** (`license.summary`): Faithful to MIT license intent.
- **Success/error messages** (`installSuccess`, `installError`, `failed`, `verified`): Appropriate tone and structure.

---

## Recommendations

1. **Priority 1 (UI Fit & Clarity)**: Fix lines 98, 100, 105, 106, 111, 133 — these may truncate or confuse users.
2. **Priority 2 (Consistency & Style)**: Fix lines 91, 95, 99, 114, 118, 127 — improves professional tone and terminology alignment.
3. **Visual Consistency**: Add ⚠ symbol to line 98 (matches Korean locale practice).
4. **Test in WinForms**: Verify dialog widths after edits, especially lines 98 and 133 which are near 150+ characters.

---

## Notes for Implementation

- All suggested edits maintain functional equivalence with Korean source.
- No changes to XML/formatting codes (`r`, {0}, {1}) — preserved as-is.
- Terminology aligned: "Connection info" (kept throughout), "port"/"Port" (capitalized per context), "JDK/JRE" (technical term, no change).
- Button labels follow Microsoft Windows naming conventions (Title Case for buttons, sentence case for labels/messages).

---

## Sign-Off

✓ Review complete. All 59 strings evaluated against Windows installer conventions, Microsoft style guide, technical accuracy, and UI fit.  
Localization is **functionally sound**; suggested refinements are **optional enhancements** for polish and user clarity.
