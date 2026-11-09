// SPDX-License-Identifier: AGPL-3.0-or-later
//! Spanish text → IPA for CHIMERA (Spain's standard pronunciation, as Finnish
//! schools teach it: `c`/`z` before e, i is [θ]; `ll` and `y` are [ʝ]).
//!
//! Spanish spelling is close to its sounds. The rules here: the digraphs
//! (`ch ll rr qu gu gü`), soft `c g` before e and i, silent `h`, `b`/`v` the
//! same sound, the trilled `r` at a word's start and after `n l s`, and the
//! soft [β ð ɣ] between vowels (the stops [b d g] after a pause or a nasal,
//! `d` also after `l`). Unstressed `i u` next to another vowel glide ([j w]).
//! Stress: the written accent, else the second-to-last syllable when the
//! word ends in a vowel, `n` or `s`, and the last one otherwise.
//! Numbers 0–100 are spelled out.

use crate::fi::Phrase;

const ONES: [&str; 30] = [
    "cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce",
    "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro",
    "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve",
];
const TENS: [&str; 10] = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];

/// A number 0–100 in words (`treinta y dos`).
pub fn number(n: u32) -> String {
    if n < 30 {
        return ONES[n as usize].to_string();
    }
    if n == 100 {
        return "cien".into();
    }
    if n < 100 {
        let t = TENS[(n / 10) as usize];
        return if n % 10 == 0 { t.to_string() } else { format!("{} y {}", t, ONES[(n % 10) as usize]) };
    }
    n.to_string()
}

fn is_vowel_letter(c: char) -> bool {
    "aeiouáéíóúü".contains(c)
}

fn plain(c: char) -> char {
    match c {
        'á' => 'a',
        'é' => 'e',
        'í' => 'i',
        'ó' => 'o',
        'ú' | 'ü' => 'u',
        _ => c,
    }
}

/// One sound of a word: IPA, and for a vowel whether it carries a written accent.
#[derive(Clone)]
struct Snd {
    ipa: String,
    vowel: bool,
    accent: bool,
}

fn letters_to_sounds(w: &str) -> Vec<Snd> {
    let ch: Vec<char> = w.chars().collect();
    let mut out: Vec<Snd> = Vec::new();
    let c = |s: &str| Snd { ipa: s.into(), vowel: false, accent: false };
    let mut i = 0;
    while i < ch.len() {
        let x = ch[i];
        let next = ch.get(i + 1).copied();
        let front = |k: usize| ch.get(k).is_some_and(|&n| "eiéí".contains(n));
        if is_vowel_letter(x) {
            out.push(Snd { ipa: plain(x).to_string(), vowel: true, accent: "áéíóú".contains(x) });
            i += 1;
            continue;
        }
        match x {
            'c' if next == Some('h') => {
                out.push(c("tʃ"));
                i += 2;
                continue;
            }
            'l' if next == Some('l') => {
                out.push(c("ʝ"));
                i += 2;
                continue;
            }
            'r' if next == Some('r') => {
                out.push(c("r"));
                i += 2;
                continue;
            }
            'q' if next == Some('u') => {
                out.push(c("k"));
                i += 2;
                continue;
            }
            'g' if next == Some('u') && front(i + 2) => {
                out.push(c("g"));
                i += 2;
                continue;
            }
            'g' if next == Some('ü') => {
                out.push(c("g"));
                out.push(c("w"));
                i += 2;
                continue;
            }
            'c' => out.push(c(if front(i + 1) { "θ" } else { "k" })),
            'g' => out.push(c(if front(i + 1) { "x" } else { "g" })),
            'z' => out.push(c("θ")),
            'j' => out.push(c("x")),
            'h' => {}
            'v' | 'b' => out.push(c("b")),
            'ñ' => out.push(c("ɲ")),
            'x' => {
                out.push(c("k"));
                out.push(c("s"));
            }
            'y' => {
                // "y" alone or at the end of a word is a vowel ("hoy", "y")
                if i + 1 == ch.len() {
                    out.push(Snd { ipa: "i".into(), vowel: true, accent: false });
                } else {
                    out.push(c("ʝ"));
                }
            }
            'r' => {
                let trill = i == 0 || (i > 0 && "nls".contains(ch[i - 1]));
                out.push(c(if trill { "r" } else { "ɾ" }));
            }
            'w' => out.push(c("w")),
            'k' | 'd' | 'f' | 'l' | 'm' | 'n' | 'p' | 's' | 't' => out.push(c(&x.to_string())),
            _ => {}
        }
        i += 1;
    }
    out
}

/// One word (lowercase) in IPA, `ˈ` before its stressed vowel. `after_pause`:
/// the word starts a phrase (or follows a nasal), so a first b d g is a stop.
pub fn word(w: &str, after_pause: bool) -> String {
    let mut s = letters_to_sounds(w);
    let n = s.len();
    // unstressed i/u beside another vowel glide: "bien" → bjen, "agua" → aɣwa
    for k in 0..n {
        if !s[k].vowel || s[k].accent || !(s[k].ipa == "i" || s[k].ipa == "u") {
            continue;
        }
        let pv = k > 0 && s[k - 1].vowel;
        let nv = k + 1 < n && s[k + 1].vowel;
        let other_strong = |j: usize| s[j].vowel && (s[j].ipa != "i" && s[j].ipa != "u" || s[j].accent);
        if (nv && other_strong(k + 1)) || (pv && other_strong(k - 1)) || (nv && !pv) {
            s[k].ipa = if s[k].ipa == "i" { "j".into() } else { "w".into() };
            s[k].vowel = false;
        }
    }
    // the stressed vowel
    let nuclei: Vec<usize> = (0..n).filter(|&k| s[k].vowel).collect();
    let stressed = if let Some(&k) = nuclei.iter().find(|&&k| s[k].accent) {
        Some(k)
    } else if UNSTRESSED.split(' ').any(|f| f == w) {
        None
    } else if nuclei.len() <= 1 {
        nuclei.first().copied()
    } else {
        let last = w.chars().last().unwrap_or('a');
        if is_vowel_letter(last) || last == 'n' || last == 's' { Some(nuclei[nuclei.len() - 2]) } else { nuclei.last().copied() }
    };
    // nasal place and the soft b d g
    let mut out = String::new();
    for k in 0..n {
        let prev = if k > 0 { Some(s[k - 1].ipa.as_str()) } else { None };
        let next = s.get(k + 1).map(|x| x.ipa.as_str());
        let mut ipa = s[k].ipa.clone();
        if ipa == "n" {
            match next {
                Some("b") | Some("p") | Some("m") => ipa = "m".into(),
                Some("k") | Some("g") | Some("x") => ipa = "ŋ".into(),
                _ => {}
            }
        }
        if ipa == "b" || ipa == "d" || ipa == "g" {
            let stop = match prev {
                None => after_pause,
                Some("m") | Some("n") | Some("ŋ") => true,
                Some("l") => ipa == "d",
                _ => false,
            };
            if !stop {
                ipa = match ipa.as_str() {
                    "b" => "β",
                    "d" => "ð",
                    _ => "ɣ",
                }
                .into();
            }
        }
        if Some(k) == stressed {
            out.push('ˈ');
        }
        out.push_str(&ipa);
    }
    out
}

const WH: &str = "dónde donde qué quién quiénes cuál cuáles cómo cuánto cuánta cuántos cuántas cuándo";

/// little words said without stress in a sentence (articles, prepositions, clitics)
const UNSTRESSED: &str = "el la los las lo le les de del a al y e o u en un una unos unas con por para sin mi mis tu tus su sus se me te nos que si";

fn sound_letter(c: char) -> bool {
    c.is_alphabetic()
}

/// Spanish text in IPA, one phrase per sentence (`.`, `!`, `?`, also `¡ ¿`
/// are ignored); a comma is a short pause inside the phrase.
pub fn to_phrases(text: &str) -> Vec<Phrase> {
    // numbers to words first
    let mut t = String::new();
    let mut digits = String::new();
    for c in text.chars().chain(std::iter::once(' ')) {
        if c.is_ascii_digit() {
            digits.push(c);
            continue;
        }
        if !digits.is_empty() {
            t.push_str(&number(digits.parse().unwrap_or(0)));
            digits.clear();
        }
        t.push(c);
    }
    let mut phrases = Vec::new();
    let mut cur = String::new();
    let mut words: Vec<String> = Vec::new();
    let mut pause = true;
    let mut first = String::new();
    let push_word = |cur: &mut String, words: &mut Vec<String>, pause: &mut bool, first: &mut String| {
        if cur.is_empty() {
            return;
        }
        if words.is_empty() {
            *first = cur.clone();
        }
        let w = word(cur, *pause);
        *pause = cur.ends_with('n') || cur.ends_with('m');
        words.push(w);
        cur.clear();
    };
    for c in t.chars() {
        let lc = c.to_lowercase().next().unwrap_or(c);
        if sound_letter(lc) {
            cur.push(lc);
        } else if lc == ',' || lc == ';' || lc == ':' {
            push_word(&mut cur, &mut words, &mut pause, &mut first);
            if !words.is_empty() {
                words.push(",".into());
            }
            pause = true;
        } else if lc == '.' || lc == '!' || lc == '?' {
            push_word(&mut cur, &mut words, &mut pause, &mut first);
            if !words.is_empty() {
                // a question with a question word falls like a statement; a yes/no question rises
                let wh = WH.split(' ').any(|q| q == first.as_str());
                phrases.push(Phrase { ipa: join(&words), question: lc == '?' && !wh, kind: crate::fi::Kind::Statement });
                words.clear();
            }
            pause = true;
        } else {
            push_word(&mut cur, &mut words, &mut pause, &mut first);
        }
    }
    push_word(&mut cur, &mut words, &mut pause, &mut first);
    if !words.is_empty() {
        phrases.push(Phrase { ipa: join(&words), question: false, kind: crate::fi::Kind::Statement });
    }
    phrases
}

fn join(words: &[String]) -> String {
    let mut s = String::new();
    for w in words {
        if w == "," {
            s.push(',');
        } else {
            if !s.is_empty() && !s.ends_with(',') {
                s.push(' ');
            }
            s.push_str(w);
        }
    }
    s.trim_end_matches(',').to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn words() {
        assert_eq!(word("manzana", true), "manθˈana");
        assert_eq!(word("llave", true), "ʝˈaβe");
        assert_eq!(word("perro", true), "pˈero");
        assert_eq!(word("rojo", true), "rˈoxo");
        assert_eq!(word("pájaro", true), "pˈaxaɾo");
        assert_eq!(word("agua", true), "ˈaɣwa");
        assert_eq!(word("bien", true), "bjˈen");
        assert_eq!(word("gracias", true), "gɾˈaθjas");
        assert_eq!(word("cangrejo", true), "kaŋgɾˈexo");
        assert_eq!(word("azul", true), "aθˈul");
        assert_eq!(word("niño", true), "nˈiɲo");
        assert_eq!(word("quiero", true), "kjˈeɾo");
        assert_eq!(word("hola", true), "ˈola");
        assert_eq!(word("dame", false), "ðˈame");
    }

    #[test]
    fn numbers() {
        assert_eq!(number(3), "tres");
        assert_eq!(number(32), "treinta y dos");
    }

    #[test]
    fn sentences() {
        let p = to_phrases("¡Hola! ¿Dónde está la llave roja?");
        assert_eq!(p.len(), 2);
        assert_eq!(p[0].ipa, "ˈola");
        assert_eq!(p[1].ipa, "dˈonde estˈa la ʝˈaβe rˈoxa");
        assert!(!p[1].question);
        assert!(to_phrases("¿Tienes una manzana?")[0].question);
    }
}
