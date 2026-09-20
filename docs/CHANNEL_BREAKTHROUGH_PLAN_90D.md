# 배포 채널 돌파 계획: 90일

기준일: 2026-09-19 (KST) · 요청: "이 벽을 어떻게 뚫을지가 최우선. 분석 말고 밀고 나갈 것."
표기: **[F]** 확인한 사실(출처) · **[I]** 추론 · **[H]** 미검증

> **이 문서에는 7점 채점 기준을 적용하지 않는다.** 그 기준은 제품을 죽일지 살릴지 판단하는 도구고, 채널은 채점 대상이 아니라 반복 실행 대상이다. 여기서 필요한 건 "완벽한가"가 아니라 "이번 주에 시작할 수 있는가"다.

**이 문서는 이 Cowork "MacOS" 세션이 2026-09-20부터 실행을 담당한다.** 현재 진행 상황과 발견 사항은 `PROJECT_STATE.md` 상단에 기록.

---

## 0. 결론 (먼저)

**단일 채널은 Claude Code / AI 에이전트 생태계다. 첫 예치금은 `agent-receipt`이고, 성공 지표는 star가 아니라 "이름을 아는 연락 가능한 사용자 수"다. 90일 목표는 30명.**

그리고 중요한 사실: **만들 게 없다.** `agent-receipt`는 이미 v0.0.4, README·데모 GIF 완성, npm 배포 직전 상태다. 이 계획은 전부 이미 확보된 주 10시간(제품홍보)만 쓴다.

---

## 1. 진단 — 벽의 정체

네 번의 실패가 B2C 때문이 아니라는 건 지난 라운드에서 확인했다. 이번 조사는 그 다음 질문에 답한다: **왜 채널이 안 생겼는가.**

- **[F] 오픈소스 star 분포는 멱법칙이다 — 상위 15% 저장소가 전체 star의 51%를 가져간다.** 제품 시장도 같은 모양이다.
- **[F] 돈이 된 오픈소스 사례는 예외 없이 "하나를 오래"였다.** Sidekiq(공개 6개월 뒤 유료화, 현재 월 ~$80k, **매출 90%가 기존 OSS 사용자 인바운드, 아웃바운드 영업 0**), Tailwind(OSS 2017-11 → 유료 2020-02, 간격 2.25년), Directus(10년간 star 0 → 에이전시 접고 단일 집중 → 시드 $1M).
- **[F] 반대로 CodeBurn은 5개월에 11.1k star를 모으고도 회수 구조가 없어 도메인이 매물로 나왔다.**

**[I] 즉 문제는 "좋은 걸 못 만들어서"가 아니라 자산이 한 곳에 쌓이지 않아서다.** 10개 제품에 흩어진 노력은 10개의 0을 만든다. 채널은 **같은 장소에 반복해서 예치해야만** 생기는 자산이다.

### 왜 하필 Claude Code 생태계인가

- **[F] 성공 사례 전부가 "자신이 그 시장의 구성원"이었다.** 도메인 소속감이 청중을 대신했다. 그는 Claude Code 헤비 유저이고 보안 배경으로 에이전트 안전 도구를 만든다 — **이 소속감은 만들어낸 게 아니라 이미 사실이다.** 다른 어떤 시장에도 이 조건이 없다.
- **[F] 시장이 실재한다.** Claude Code 본체 npm 주간 다운로드 1,227만.
- **[F] 1인이 심사를 거쳐 들어갈 수 있는 공식 유입 노드가 있다 — 단, 둘 다 조건이 있다는 게 09-20 재확인에서 드러났다.** `awesome-claude-code`(53.1k stars)는 PR이 아니라 GitHub 이슈로만 접수하며 "첫 커밋 후 14일 경과 + 활발한 개발" 또는 "star 100개 이상" 중 하나를 충족해야 한다(현재 repo는 09-17 생성, 3일차, star 0 — 미충족). `anthropics/claude-plugins-official`(36.5k stars)은 신청 절차 자체가 없다 — Anthropic이 자체 재량으로 선별하며, 제출 폼이 있어도 이 마켓플레이스에는 추가되지 않는다. 실제 신청 가능한 곳은 커뮤니티 마켓플레이스(`claude-plugins-community`)이고, 여기 올리려면 agent-receipt를 지금의 npm CLI 구조가 아니라 실제 플러그인 매니페스트(`.claude-plugin/plugin.json` + `hooks/hooks.json`)로 재구성해야 한다 — 이건 신규 엔지니어링이라 §6의 개발 보류 결정과 충돌한다.
- **[F] 영어는 "쓰는 영어"만 필요하다.** 비영어권 반례인 Tony Dinh(베트남)의 경로는 전부 영어 글쓰기였고 전화 세일즈가 없었다. 읽기·쓰기 C1/C2면 충분하고 말하기 B1은 장애가 아니다.
- **[F] Rob Walling의 Stair Step: 무청중 1단계는 반드시 "단일 트래픽 채널 + 남의 생태계 애드온"이어야 한다.** 이유는 신규 진입자가 여러 채널을 동시에 배울 수 없고, 마켓플레이스가 발견을 대신해주기 때문이다.

---

## 2. 성공 지표를 바꾼다

**[F] Sidekiq의 첫 매출은 "헤비 유저 20명 중 5~10명"이 유료 출시 즉시 구매한 것이었고, 이후 매출의 90%가 기존 OSS 사용자 인바운드였다.**
**[F] Caleb Porzio의 GitHub Sponsors 누적 $1M 내역에서 순수 후원은 $5k뿐이고, 나머지는 전부 이메일 명단·로고 배치·유료 콘텐츠에서 나왔다.**
**[F] HN 프론트 트래픽은 48시간 뒤 일 650뷰로 죽는다.**

**[I] 따라서 star는 채널이 아니라 선행 지표일 뿐이다. 진짜 자산은 "내가 이름을 알고, 내가 먼저 연락할 수 있고, 내 도구를 실제로 쓰는 사람"의 명단이다.**

| 측정하지 않을 것 | 측정할 것 |
|---|---|
| GitHub star 수 | **이름을 아는 실사용자 수** |
| npm 다운로드 총량 | 재방문·재실행하는 사용자 수 |
| HN 점수 | 이슈·PR·디스커션에 **두 번 이상** 등장한 사람 |
| 트위터 팔로워 | 내가 이메일 보낼 수 있는 사람 수 |

**90일 목표: 연락 가능한 실사용자 30명.** [I] Sidekiq 비율(헤비 유저 20명 → 첫 고객 5~10명)에서 역산한 수치다.

---

## 3. 90일 실행 계획

### 1주차 (9/22~9/28) — 공개

이번 주에 다 끝낸다. 만들 게 없으므로 전부 배포 작업이다.

1. **계측부터 건다 (공개 전).** star·npm 다운로드·리퍼러를 **일 단위로 기록**. Hermes 크론이 이미 있으니 거기 붙인다.
   - **[F] 중요: HN 유입은 Referrer 헤더가 없어 대부분 "direct"로 찍힌다** (실측 사례에서 referrer 864 vs 실제 유입 14.6만). 이걸 모르면 2주 뒤에 뭐가 통했는지 판독이 불가능하다.
2. **[F] 09-20 완료: README 첫 화면에 `npx @jonnylab/agent-receipt show`를 "설치 없이 먼저 보기"로 명시하고, Discussions 링크를 상단에 추가했다.** (커밋 완료, 푸시는 사용자가 직접 진행)
   - `init`(hooks 설치, 안정 경로 필요)에만 npx가 안 된다는 걸 명확히 하고, 읽기 전용 `show`는 무설치 진입점으로 안내한다. 추가 엔지니어링 없이 문서만 고쳤다.
3. **게시 시각을 KST 21:00~익일 02:00(= 12–17 UTC)으로 고정한다.**
   - **[F] 138개 AI 도구 실증 연구에서 게시 시각은 star 수의 주요 예측 변수였고, 시각 하나가 최대 ~200 star 차이를 만들었다.** 나머지 두 예측 변수는 HN 점수와 기존 star 수다.
4. **[F] 09-20 완료: GitHub public + npm publish + r/ClaudeAI 정식 게시물 제출.**
   - **[F] 09-20 확인: HN·GN 둘 다 계정 나이 게이트에 막혔다 — 콘텐츠 문제가 아니다.** GN은 가입 14일 미만이면 Show GN 등록이 막힌다고 공식 안내에 나와 있고(가입일 2026-09-18), HN도 "Sorry, your account is too new to submit this site" 오류가 별도로 존재하며 비공식 문서상 신규 계정은 가입 후 약 2주간 별도 표시된다 — 같은 부류의 게이트로 추정된다(HN은 정확한 일수를 공식 공개하지 않음).
   - **[F] r/ClaudeAI도 같은 부류의 게이트가 있다 — 자동화 댓글이 "OP karma>50 필요, 미달 시 피드가 아니라 위클리 메가스레드로 전환(Rule 7)"이라고 명시한다.** 카르마 11(50 미만 확인).
   - **[F] 09-20 결과: 게시물은 모더레이터에 의해 제거·잠금 처리됐다 ("Locked post. New comments cannot be posted. Sorry, this post has been removed by the moderators").** 예상했던 "메가스레드로 전환"이 실제로는 피드 게시물 자체 삭제 + 모드봇 댓글로 리다이렉트 안내라는 더 강한 형태로 나타났다 — feed 노출은 전혀 없었다. 모드봇(Wilson)이 "Your Showcase project DOES meet minimum requires for inclusion on our Build with Claude Project Showcase Megathread"라고 확인해줬고, 해당 주간 Megathread에 **댓글로** 재게시하라고 안내함: `https://www.reddit.com/r/ClaudeAI/comments/1wkkdca/built_with_claude_project_showcase_megathread/`
   - **[F] 09-20 완료: 위 Megathread에 댓글로 재게시함.** https://www.reddit.com/r/ClaudeAI/comments/1wkkdca/comment/pax1kcx/ — feed 단독 게시는 karma 50 이상 쌓일 때까지 원천적으로 막혀 있다는 뜻이므로, 두 번째 feed 시도는 karma가 자연히 쌓인 뒤(진성 댓글 활동)로 미룬다.
   - **[I] 일반화된 교훈:** 계정·저장소가 신규인 상태에서 플랫폼은 전부 진입장벽을 건다. 다음에 새 플랫폼을 채널로 쓸 때는 실제 게시 전에 반드시 그 플랫폼의 신규 계정/신규 저장소 제한(나이·karma·star·심사)부터 확인한다. `awesome-claude-code`도 09-20 재확인에서 같은 패턴이 나왔다 (아래 5번).
5. **[F] 09-20 재확인: `awesome-claude-code`는 PR이 아니라 GitHub 이슈 제출이고, repo가 "14일 이상 + 활발한 개발" 또는 "star 100개" 조건을 충족해야 접수된다.** agent-receipt는 09-17 생성 3일차·star 0이라 지금 접수해도 반려될 가능성이 높다 — HN·GN·r/ClaudeAI와 같은 부류의 신규 진입 게이트다. **10/1 전후(14일 시점, GN 재시도와 거의 같은 주)로 미루고, 이슈 내용은 미리 써서 대기시킨다.**
6. **[F] 09-20 재확인: `anthropics/claude-plugins-official`은 신청 절차가 없다 — 이 항목은 계획에서 뺀다.** 실제로 열려 있는 건 커뮤니티 마켓플레이스(`claude-plugins-community`, 제출 폼: platform.claude.com/plugins/submit)인데, 여기 올리려면 agent-receipt를 npm CLI가 아니라 `.claude-plugin/plugin.json` + `hooks/hooks.json` 구조의 실제 플러그인으로 재작성해야 한다 — 이건 새 엔지니어링이라 §6의 "개발 보류" 결정과 직접 충돌한다. **지금 하지 않는다.** 트래픽 신호가 쌓여 재오픈 조건(200★/무요청 문의)에 가까워지면 그때 재검토한다.
7. **10/1~10/2 전후 (계정·저장소 14일 시점): Show HN·Show GN·awesome-claude-code 이슈, 세 가지를 함께 재시도한다.** 이때는 새 문구로 — 같은 콘텐츠 반복 제출은 GN 운영 정책 위반(같은 프로젝트 재소개 금지 조항)이니 문구를 다르게 가져간다.

**미리 정해둘 것 — 1회 실패는 정상이다.**
- **[F] 직접 집계한 Show HN 1,000건 표본에서 중앙값은 2점이고, 100점 이상(대략 프론트 도달)은 1.5%였다.**
- **[F] ccusage도 HN 3회 게시 중 2회가 2~4점이었고, 최고점이 75점인데도 그 카테고리에서 유일하게 수익화에 도달했다.**
- **→ 첫 게시가 묻히면 다른 각도의 제목으로 재게시한다. 이건 실패가 아니라 절차의 일부다.** 재게시 제목 2개를 공개 전에 미리 써둔다.

### 2~4주차 — 명단 만들기

- 반응한 사람을 **전원 이름으로 기록한다.** 이슈·PR·디스커션·star·댓글 전부.
- 그중 **실제로 쓰는 사람**을 가려낸다(두 번 이상 등장, 구체적 사용 맥락 언급, 버그 리포트에 실제 경로가 찍힌 경우).
- **[F] Sidekiq이 한 일이 정확히 이것이다 — 헤비 유저 20명을 이름으로 알고 있었고, 거기서 첫 매출이 나왔다.**
- 두 번째 게시(다른 각도, 다른 채널)를 이 구간에 배치한다.
- **이 구간에 수익화 작업은 하지 않는다.** [F] Sidekiq 6개월, Tailwind 2.25년이 걸렸다. 2주차에 유료화를 시도하면 명단도 못 만들고 신뢰도 잃는다.

### 2개월차 — 두 번째 예치

- **같은 생태계, 같은 청중에게 작은 도구를 하나 더 낸다.** 새 시장으로 가지 않는다.
- 첫 레포에서 크로스링크한다. **[F] 기존 star 수가 다음 런치의 2번째 예측 변수다 — 앞선 저장소가 다음 저장소를 밀어준다.**
- 무엇을 만들지는 1개월차 명단에서 나온다. 사용자가 두 번 이상 언급한 결핍을 고른다.

### 3개월차 — 집중

- 두 개 중 **반응이 있는 쪽에 몰아넣는다.** 둘 다 끌고 가지 않는다.
- 헤비 유저 20명에게 **직접 연락한다.** 판매가 아니라 질문이다: 무엇 때문에 쓰는지, 무엇이 없어서 불편한지.
- **[F] 돈이 된 사례는 전부 "하나를 2년 붙든" 쪽이었다.** 여러 개 내기는 히트를 찾는 탐색 비용으로만 정당화된다. 3개월차는 탐색을 끝내고 집중으로 넘어가는 지점이다.

---

## 4. 판단 게이트 (D+90)

| 상태 | 판정 |
|---|---|
| 연락 가능한 실사용자 **30명 이상** | 채널이 생겼다. 이 생태계에 계속 예치한다. 수익화는 이 다음 문제다. |
| **10~29명** | 신호는 있다. 전략을 바꾸지 말고 **투입량을 늘린다** — 같은 생태계, 더 많은 예치. |
| **10명 미만** | 생태계를 바꾼다. **전략(단일 생태계 예치)이 아니라 생태계를 바꾸는 것이다.** 이 구분이 중요하다. |

**미리 못 박아둘 것:** 90일 안에 매출이 안 나오는 건 실패가 아니다. 그건 예정된 일이다. 실패는 **90일 뒤에도 이름을 아는 사용자가 없는 것**이다.

---

## 5. 정직한 기대치

- **[F] 오픈소스 → 수익 전환에 걸린 시간: Sidekiq 6개월, Tailwind 2.25년.** 이 경로는 월 300만원을 빠르게 만들지 않는다.
- **[F] 마이크로 SaaS 약 70%가 월 $1,000 미만이다.**
- **[I] 이 계획이 만드는 건 매출이 아니라 "다음 제품을 냈을 때 봐줄 사람이 있는 상태"다.** 그게 지금까지 네 번 다 없었던 변수고, 그게 없으면 어떤 제품을 만들어도 같은 자리에서 막힌다.

### 현금 브릿지 (선택, 별도 시간으로)

90일 동안 수입이 0인 게 부담이면 크몽이 유일하게 메커니즘이 공개된 채널이다. **단, 이건 채널 구축과 별개의 작업이고 주 10시간을 잠식하면 안 된다.**

- **[F] 크몽 등록 심사는 카테고리 평균가의 약 60% 이상이어야 통과한다** (4회 반려 후 5번째 승인 사례).
- **[F] 승인 후에는 저가 침투가 작동한다** — 79,000원 등록 후 1주일 0건 → 1만원으로 첫 판매 → 한 달 안에 39,000원에서 월 30건+ 회복. 핵심은 "기성 판매자가 아니라 같은 신입과 비교해 가격을 잡는 것".
- **[F] 첫 달 약 50만원 → 4개월 뒤 월 100만원 돌파 사례 존재.**
- **[F] 반대로 숨고·위시켓은 자본 0에 부적합하다.** 숨고는 견적 발송마다 캐시가 나가는 선불 광고 모델(6일간 19건 발송, 매칭 0건 사례), 위시켓은 프로젝트당 경쟁 50~100곳에 월 단위 상주 인력시장(주니어 390~425만원/월)이라 소액 제품 판매처가 아니다.

---

## 6. 기존 결정과 충돌하지 않는 이유

`agent-receipt`는 **2일 빌드 캡 + 수익화 작업 금지 + 재오픈 조건 잠금**으로 이미 종료 결정이 나 있다. 이 계획은 그 결정을 되돌리지 않는다.

- **빌드 캡은 그대로다.** 실제로 빌드는 이미 끝났다(v0.0.4, README, 데모 GIF 완성).
- **수익화 작업도 여전히 하지 않는다.** 이 계획의 산출물은 매출이 아니라 명단이다.
- **바뀌는 것은 단 하나 — 공개하고 끝내는 대신, 공개 후 2주를 계측하고 따라간다.** 추가 시간은 이미 배정된 주 10시간 제품홍보 예산 안에서 쓴다.
- **재오픈 조건(30일 내 200 star 또는 무요청 유료 문의)도 그대로 둔다. 다만 이 계획의 판정 기준은 그것과 별개다 — star가 아니라 명단이다.**
- **[F] 09-20 재확인: "0.0.4에서 추가 개발 전략"을 지금 짜지 않기로 확정.** 배포가 채널 전반에서 계정/저장소 나이 마찰로 아직 제대로 시작도 못 한 상태라 판단할 신호 자체가 없고, 지금 개발 계획을 세우는 건 재오픈 조건 잠금을 슬쩍 여는 것과 같다. 지금 할 일은 코드가 아니라 배포 마찰 해소(README 문구 — 완료, karma 쌓기, 14일 시점 재시도 대기)뿐이다.
- **[F] 09-20 재확인: `claude-plugins-community` 제출도 같은 이유로 지금 하지 않는다.** 플러그인 매니페스트 재작성은 "0.0.4+ 추가 개발"에 해당하는 신규 엔지니어링이고, 배포 신호가 아직 없는 지금 이걸 시작하는 것도 개발 보류 결정과 충돌한다.

---

## Sources

**오픈소스 → 수익**
- Sidekiq / Mike Perham 인터뷰: https://www.indiehackers.com/podcast/016-mike-perham-of-sidekiq
- Tailwind CSS 수익화 타임라인: https://adamwathan.me/tailwindcss-from-side-project-byproduct-to-multi-mullion-dollar-business/
- Caleb Porzio GitHub Sponsors $1M 내역: https://calebporzio.com/i-just-cracked-1-million-on-github-sponsors-heres-my-playbook
- Filippo Valsorda 풀타임 메인테이너 리테이너: https://words.filippo.io/full-time-maintainer/
- Directus 10년간 star 0 → 단일 집중: https://medium.com/@ben_haynes/i-started-an-open-source-project-in-2004-8d38820a7ecd

**노출 메커니즘 실측**
- HN → star 전환 실증 연구(138개 AI 도구, 게시 시각 변수): https://arxiv.org/html/2511.04453v1
- HN 프론트 트래픽 실측 및 referrer 누락: https://luke.hsiao.dev/blog/2023-hn-traffic/
- GitHub 프로젝트 생존율: https://livablesoftware.com/survival-rate-github-projects-empirical/
- star 분포 멱법칙: https://kvinogradov.com/open-source-growth-benchmarks/

**무청중 솔로 파운더 경로**
- Rob Walling, Stair Step Method: https://robwalling.com/essays/2015/03/26/the-stair-step-method-of-bootstrapping
- DropCommerce(청중 0 → $78k CAD MRR): https://www.indiehackers.com/post/i-bootstrapped-a-shopify-app-to-78k-cad-mrr-in-3-years-ask-me-anything-5fbbc2b886
- Erikas Mališauskas(4개월 $1k MRR → $250k 매각): https://malisauskas.medium.com/from-zero-to-1000-mrr-in-4-months-how-i-created-a-shopify-app-microsaas-b84cf72e24f5
- Livy(리뷰 부트스트랩 생략 → 3설치): https://www.indiehackers.com/post/we-got-our-shopify-app-approved-in-72-days-now-were-stuck-at-distribution-and-people-keep-offering-us-paid-reviews-df8505401d
- 무청중 Product Hunt/HN 동시 론칭 15일 $0: https://www.indiehackers.com/post/15-days-after-launching-to-zero-audience-0-1-follower-0-stars-the-full-numbers-c14435be6c
- Tony Dinh(비영어권, 글쓰기 영어, $500 MRR까지 12개월): https://news.tonydinh.com/p/my-solopreneur-story-zero-to-45kmo
- 마이크로 SaaS 70%가 월 $1,000 미만: https://freemius.com/blog/state-of-micro-saas-2025/

**한국 마켓플레이스**
- 크몽 저가 침투(79,000 → 1만 → 39,000원): https://brunch.co.kr/@a6d3cdf4523141f/33
- 크몽 등록 심사 4회 반려: https://brunch.co.kr/@view0814/12
- 크몽 등급·매출 타임라인: https://brunch.co.kr/@pelci/34
- 숨고 견적 19건 매칭 0: https://brunch.co.kr/@essaytowin/40
- 위시켓 경쟁 50~100곳: https://www.openads.co.kr/content/contentDetail?contsId=19749
- 위시켓 프리랜서 단가(월 단위): https://blog.wishket.com/blog/freelance-developer-market-trend-2025
- 명함 2,000장 → 100명 중 1명 전환: https://brunch.co.kr/@jamess/102

**채널 제출 규칙 (09-20 재확인)**
- awesome-claude-code 기여 가이드(이슈 제출, 14일/100★ 자격 조건): https://github.com/hesreallyhim/awesome-claude-code/blob/main/CONTRIBUTING.md
- awesome-claude-code 리소스 추천 이슈 템플릿: https://github.com/hesreallyhim/awesome-claude-code/issues/new?template=recommend-resource.yml
- Claude Code 플러그인 생성/제출 공식 문서(official vs community 마켓플레이스 구분): https://code.claude.com/docs/en/plugins

**리서치 한계:** SEO·콘텐츠의 "첫 유입까지 기간" 1차 데이터와 awesome-list 등재 효과의 정량 데이터는 확보하지 못했다(검색 상위가 대부분 AI 생성 콘텐츠팜). 한국어권에서 콘텐츠·오픈소스·콜드아웃바운드로 첫 B2B 고객을 얻은 **숫자 있는 1차 사례는 0건**이었다 — 한국 사례는 마켓플레이스와 대면 영업에 몰려 있다. 검증 가능한 한국인 글로벌 B2B 마이크로 SaaS 사례도 찾지 못했다. 배제한 출처: lead-scorer.com, superframeworks.com, saasranger.com, repoclip.io, githubstarmate.com 등 AI 생성 의심 콘텐츠팜 다수.
