use rg_engine::Engine;

fn engine(script: &str, css: &str) -> Engine {
    let mut e = Engine::new();
    e.vfs.add_text("/games/t/game.json", r#"{ "name": "T", "width": 200, "height": 100 }"#);
    e.vfs.add_text("/games/t/game.tsx", script);
    e.vfs.add_text("/games/t/style.css", css);
    e.vfs.add_text("/games/t/lib/util.ts", "export function twice(n: number): number { return n * 2; }");
    e.resize(400.0, 400.0);
    e
}

#[test]
fn a_tap_reaches_the_handler_and_a_save_is_persisted() {
    let mut e = engine(
        r#"
        import { twice } from "lib/util";
        let n = rg.load("n", 0);
        function view() {
          return <div className="s"><div id="b" className="b" onClick={() => { n = twice(n + 1); rg.save("n", n); rg.sound("pop"); }}>n = {n}</div></div>;
        }"#,
        ".s { width: 200px; height: 100px; } .b { width: 100px; height: 50px; background-color: #ff0000; color: #ffffff; }",
    );
    e.start("t").unwrap();
    // fixed 200x100 in a 400x400 screen: scale 2, centred vertically
    assert_eq!(e.scale, 2.0);
    assert_eq!(e.off_y, 100.0);
    e.frame(16.0).unwrap();
    e.take_host_commands();
    // the button's middle on the screen
    e.pointer(0, 1, 100.0, 150.0);
    e.pointer(2, 1, 100.0, 150.0);
    e.frame(16.0).unwrap();
    let cmds = e.take_host_commands();
    assert!(cmds.iter().any(|c| c.kind == "sound" && c.name == "pop"));
    assert!(cmds.iter().any(|c| c.kind == "persist" && c.name == "/save/t.json"));
    assert_eq!(e.vfs.read_text("/save/t.json"), "{\"n\":2}");
    e.frame(16.0).unwrap();
    assert!(e.draw.strings.iter().any(|s| s == "n = 2"));
    // the text inherits the box's white
    let n = &e.draw.nums;
    let mut i = 0;
    let mut white_text = false;
    while i < n.len() {
        if n[i] == 3.0 && n[i + 5] == 255.0 && n[i + 6] == 255.0 && n[i + 7] == 255.0 {
            white_text = true;
        }
        i += rg_engine::draw::HEADER + n[i + 22] as usize;
    }
    assert!(white_text);
}

#[test]
fn a_script_error_is_shown_and_a_tap_goes_to_the_launcher() {
    let mut e = engine("function tick() { throw new Error('boom'); } function view() { return <div/>; }", "");
    e.vfs.add_text("/games/launcher/game.json", r#"{ "name": "L", "hidden": true }"#);
    e.vfs.add_text("/games/launcher/game.tsx", "function view() { return <div>menu</div>; }");
    e.start("t").unwrap();
    let r = e.frame(16.0);
    assert!(r.unwrap_err().contains("boom"));
    assert!(e.draw.strings.iter().any(|s| s.contains("boom")));
    e.pointer(0, 1, 10.0, 10.0);
    e.pointer(2, 1, 10.0, 10.0);
    let _ = e.frame(16.0);
    assert_eq!(e.game.as_ref().unwrap().id, "launcher");
    e.frame(16.0).unwrap();
    assert!(e.draw.strings.iter().any(|s| s == "menu"));
}

#[test]
fn a_syntax_error_names_the_file() {
    let mut e = engine("function view( { return 1; }", "");
    let err = e.start("t").unwrap_err();
    assert!(err.contains("/games/t/game.tsx"), "{}", err);
}

#[test]
fn say_queues_voice_clips_by_id() {
    let mut e = engine(
        r#"
        let said = false;
        function tick() {
          if (!said) {
            said = true;
            rg.say("hyva");
            rg.say(["valitse", rg.sayId.number(7), rg.sayId.letter("Ä"), rg.sayId.word("Pöllö")], { queue: true });
            rg.stopSay();
          }
        }
        function view() { return <div />; }"#,
        "",
    );
    e.start("t").unwrap();
    e.frame(16.0).unwrap();
    let cmds = e.take_host_commands();
    let says: Vec<_> = cmds.iter().filter(|c| c.kind == "say").collect();
    assert_eq!(says.len(), 3);
    assert_eq!(says[0].name, "/games/_voice/fi/hyva.wav");
    let list: Vec<String> = says[1].args.get("list").items().iter().map(|j| j.as_str()).collect();
    assert_eq!(
        list,
        vec![
            "/games/_voice/fi/valitse.wav",
            "/games/_voice/fi/n7.wav",
            "/games/_voice/fi/kirjain_ae.wav",
            "/games/_voice/fi/sana_pollo.wav"
        ]
    );
    assert!(says[1].args.get("queue").as_bool());
    assert_eq!(says[2].args.get("list").items().len(), 0);
}

#[test]
fn eval_sees_the_games_names_and_the_tree_has_the_boxes() {
    let mut e = engine(
        r#"
        let score: number = 3;
        const state = { level: 2, names: ["a", "b"] };
        function view() {
          return <div className="s"><div className="b" onClick={() => { score++; }}>Pelaa</div><div>Pisteet {score}</div></div>;
        }"#,
        ".s { width: 200px; height: 100px; } .b { width: 100px; height: 50px; }",
    );
    e.start("t").unwrap();
    e.frame(16.0).unwrap();
    assert_eq!(e.eval("JSON.stringify({score, state})").unwrap(), r#"{"score":3,"state":{"level":2,"names":["a","b"]}}"#);
    assert_eq!(e.eval("Object.keys(__handlers).length").unwrap(), "1");
    assert!(e.eval("nope.x").is_err());
    let t = e.ui.tree().write();
    assert!(t.contains(r#""cls":"b","x":0,"y":0,"w":100,"h":50"#), "{}", t);
    assert!(t.contains(r#""text":"Pelaa""#), "{}", t);
    assert!(t.contains(r#""text":"Pisteet 3""#), "{}", t);
}

#[test]
fn without_a_launcher_there_is_no_close_button_and_exit_stays() {
    let script = "function view() { return <div id=\"q\" onClick={() => rg.exit()}>peli</div>; }";
    let mut e = engine(script, "");
    e.start("t").unwrap();
    e.frame(16.0).unwrap();
    assert!(!e.draw.strings.iter().any(|s| s == "✕"));
    assert_eq!(e.eval("rg.exit(); __cmds.length").unwrap(), "0");
    // with a launcher the close button is there
    let mut e = engine(script, "");
    e.vfs.add_text("/games/launcher/game.json", r#"{ "name": "L", "hidden": true }"#);
    e.vfs.add_text("/games/launcher/game.tsx", "function view() { return <div>menu</div>; }");
    e.start("t").unwrap();
    e.frame(16.0).unwrap();
    assert!(e.draw.strings.iter().any(|s| s == "✕"));
}

/// The text runs of the last frame: (x, w, text).
fn text_runs(e: &Engine) -> Vec<(f32, f32, String)> {
    let (n, mut i, mut out) = (&e.draw.nums, 0, Vec::new());
    while i < n.len() {
        let extra = n[i + 22] as usize;
        if n[i] == 3.0 {
            out.push((n[i + 1], n[i + 3], e.draw.strings[n[i + 18] as usize].clone()));
        }
        i += rg_engine::draw::HEADER + extra;
    }
    out
}

#[test]
fn wrapped_lines_are_as_wide_as_their_ink_so_painters_keep_them_aligned() {
    let mut e = engine(
        r#"
        function view() {
          return <div className="s">
            <div className="p">Musta ja valkoinen pelaavat vuorotellen viivojen risteyksiin.</div>
            <div className="p c">Musta ja valkoinen pelaavat vuorotellen viivojen risteyksiin.</div>
          </div>;
        }"#,
        ".s { width: 200px; height: 100px; align-items: center; } .p { width: 150px; font-size: 12px; } .c { text-align: center; }",
    );
    e.start("t").unwrap();
    e.frame(16.0).unwrap();
    let runs = text_runs(&e);
    assert!(runs.len() >= 4, "{:?}", runs);
    let half = runs.len() / 2;
    let x0 = runs[0].0;
    for (x, w, t) in &runs[..half] {
        assert_eq!(*x, x0, "{}", t);
        assert!(*w <= 150.0, "{}", t);
    }
    assert!(runs[half - 1].1 < 140.0, "the last line is shorter than the box: {:?}", runs);
    for (x, w, t) in &runs[half..] {
        assert!(((x + w / 2.0) - (x0 + 75.0)).abs() < 1.0, "centred: {} {:?}", t, runs);
    }
}

// a row stays on one line as in CSS (EVG's own default wraps): a growing
// text column beside a fixed box shares the line and its text wraps in it
#[test]
fn a_row_does_not_wrap_unless_asked() {
    let script = r#"function view() { return <div className="s"><div className="row">
        <div className="n">1</div>
        <div className="c"><div>Kumpi kulma?</div><div className="d">Harjoittele kulmakivestä laajentamista ja arvioi yhteyden vahvuutta.</div></div>
      </div></div>; }"#;
    let css = ".s { width: 200px; height: 100px; } .row { width: 200px; flex-direction: row; align-items: center; gap: 8px; }
        .n { width: 30px; height: 30px; } .c { flex-grow: 1; min-width: 0px; align-items: flex-start; } .d { width: 100%; font-size: 11px; }";
    let mut e = engine(script, css);
    e.start("t").unwrap();
    e.frame(16.0).unwrap();
    let (n, mut i) = (&e.draw.nums, 0);
    let (mut one, mut title) = (None, None);
    let mut lines = 0;
    while i < n.len() {
        if n[i] == 3.0 {
            let s = &e.draw.strings[n[i + 18] as usize];
            if s == "1" { one = Some((n[i + 1], n[i + 2])); }
            if s == "Kumpi kulma?" { title = Some((n[i + 1], n[i + 2])); }
            if s.starts_with("Harjoittele") || s.contains("vahvuutta") { lines += 1; }
        }
        i += rg_engine::draw::HEADER + n[i + 22] as usize;
    }
    let (one, title) = (one.unwrap(), title.unwrap());
    assert!(title.0 > one.0 + 30.0, "the title beside the number: {:?} {:?}", one, title);
    assert!(lines >= 2, "the description wraps in its column");
}

#[test]
fn an_installed_download_replaces_the_game_it_names() {
    let mut e = Engine::new();
    e.vfs.add_text("/games/mansepoli/game.json", r#"{ "name": "Mansepoli", "order": 51, "section": "aly" }"#);
    e.vfs.add_text("/games/mansepoli/_built.json", r#"{ "updated": "2026-11-14T10:00:00Z" }"#);
    e.vfs.add_text("/games/g1/game.json", r#"{ "name": "Mansepoli", "replaces": "mansepoli" }"#);
    // not installed (no _store.json): nothing is replaced
    let gs = e.games();
    assert_eq!(gs.iter().find(|g| g.id == "mansepoli").unwrap().replaced_by, "");
    assert_eq!(gs.iter().find(|g| g.id == "mansepoli").unwrap().updated, "2026-11-14T10:00:00Z");
    // installed: the download takes the old game's place, the old one is marked
    e.vfs.add_text("/games/g1/_store.json", r#"{ "id": "g1", "version": 1, "updated": "2026-11-20T18:48:21Z" }"#);
    let gs = e.games();
    assert_eq!(gs.iter().find(|g| g.id == "mansepoli").unwrap().replaced_by, "g1");
    let g = gs.iter().find(|g| g.id == "g1").unwrap();
    assert_eq!(g.order, 51.0);
    assert_eq!(g.section, "aly");
    assert_eq!(g.updated, "2026-11-20T18:48:21Z");
    // removed again: the old game is not replaced
    e.vfs.add_text("/games/g1/_store.json", r#"{ "id": "g1", "version": 1, "removed": true }"#);
    let gs = e.games();
    assert!(!gs.iter().any(|g| g.id == "g1"));
    assert_eq!(gs.iter().find(|g| g.id == "mansepoli").unwrap().replaced_by, "");
}
