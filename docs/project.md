## DOWN

This project let AI agent play game against real player in 2v2 or 1v1 Pokemon showdown VCG 

## Core Components

```
- lib/
    llm.js
    showdown
    prompts
- core/
    agent.js
```

`llm.js` is library will have contain logic of connect dynamically to different LLM model
`showdown` is lightweight client of pokemon showdown official (reference of complete client is present in `ref` all we need to do is strip it down )
`prompt` prompt will contain multiple templated *.txt file will hold instruction prompt 
`agent.js` is which contains `start()`, `initialize()`, `prase()` in method
`gameLoop.js`
`logger.js`
`noteMaker.js`

Methods
`start()`: this function will start the game loop
    - it will pass initialize `initialize` method
    - run the `find_match()`
    - wait for `find_match()` return result 
    - after the find match is successful
        - LLM will be given GAME START + HIS TEAM and TEAM of Opponent players(final prompt made by `prompter.js`) 
        - Here game loop start:
            - LMM will return its move 
            - LLM receives results
            - LLM will plays 
            - LLM receives results
            - LLM records + plays
        - until game is over or round is over 
        - after `start()` will start next round
            - game will loop start again


`initialize()`: will initialize chat from `llm.js` and setup model and provider for LLM
`prase()`: because how prompt will written the LLM will respond in json, `prase()` responsibility to LLM output and if need apply json repair
          output of prase will be send as request in game by `send_move()` and if LLM output any note the noteMaker() will be used to create 
`gameloop.js` this will contain logic complete name loop
`logger.js ` as there will not UI to this project, the logger.js will responsible for logging each even happening 
`notemaker.js` just simple markdown writing and getter will responsible helping llm to write some "point to take notice", "some move that it liked", "a trick that it discoverd" and more this notemaker is not for logging it will responsible only collecting facts that can effect the later games and improve the current team or new which will create later       

