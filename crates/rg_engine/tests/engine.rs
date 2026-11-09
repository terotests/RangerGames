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
