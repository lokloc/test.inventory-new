<!-- codex-summary:start -->
# test.inventory

재고관리 프로그램

## 구현 기능 요약

### App 화면

- 역할: 화면 정보 표시와 사용자 입력 처리
- 처리 내용: 입력값 또는 선택 데이터를 수정

### 회사 정보 화면

- 역할: 목록 조회 및 항목 선택, 업무 명령 실행
- 주요 항목: 플랜트 목록, Oleum, 재고 실사, 재고 이동, 실사 내역, 이동 내역, 마스터 데이터, 설정
- 사용자 동작: 데이터 새로고침 [onRefreshPress], 관련 화면으로 이동 [onPlantNavigate], 값 변경 반영 [onViewModeChange]
- 처리 내용: OData/모델 데이터를 조회해 화면에 바인딩; 입력값 또는 선택 데이터를 수정; 목록·상세·등록 화면 사이를 이동; 검색 조건으로 목록을 필터링; 처리 결과와 오류 메시지를 사용자에게 안내
- 주요 기능: After Rendering, Exit, 관련 화면으로 이동, 값 변경 반영, 데이터 새로고침, success, error

### Tank 화면

- 역할: 목록 조회 및 항목 선택, 조건 입력 및 값 선택, 탭별 정보 구분, 업무 명령 실행
- 주요 항목: Oleum, 재고 실사, 재고 이동, 실사 내역, 이동 내역, 개요, 탱크 현황, 실사
- 사용자 동작: 이전 화면으로 이동 [onNavBack], 메인 화면으로 이동 [onHomeBreadcrumbPress], 기능 실행 [onStatusLegendPress], 신규 등록 [onCreateAuditPress], 데이터 새로고침 [onRefreshPress], 기능 실행 [onTankMapItemPress], 기능 실행 [onTankRowClick], 첫 페이지 이동 [onTableFirstPage], 이전 페이지 이동 [onTablePrevPage], 다음 페이지 이동 [onTableNextPage]
- 처리 내용: OData/모델 데이터를 조회해 화면에 바인딩; 입력값 또는 선택 데이터를 수정; 목록·상세·등록 화면 사이를 이동; 검색 조건으로 목록을 필터링; 표시 데이터를 정렬; 처리 결과와 오류 메시지를 사용자에게 안내; 팝업/다이얼로그를 열어 추가 입력이나 확인을 처리
- 주요 기능: After Rendering, Exit, 이전 화면으로 이동, 관련 화면으로 이동, 메인 화면으로 이동, 항목 선택, 값 변경 반영, 조건 검색, 데이터 새로고침, Table First Page, Table Prev Page

### Tank Detail 화면

- 역할: 업무 명령 실행
- 주요 항목: Oleum, 재고금액, 기본 및 품질 정보, 플랜트, 탱크번호, 품질번호, API비중, 황 함유량
- 사용자 동작: 팝업 또는 화면 닫기 [onCloseDetail], 데이터 새로고침 [onRefresh], 메인 화면으로 이동 [onHomeBreadcrumbPress], 기능 실행 [onPlantBreadcrumbPress], 기능 실행 [onToggleInteriorViewPress], Toggle Viewport Toolbar [onToggleViewportToolbar], 기능 실행 [onInventoryMeasurePress], 기능 실행 [onTankUsageHistoryPress], 기능 실행 [onLossHistoryPress]
- 처리 내용: OData/모델 데이터를 조회해 화면에 바인딩; 입력값 또는 선택 데이터를 수정; 선택 데이터를 삭제; 목록·상세·등록 화면 사이를 이동; 검색 조건으로 목록을 필터링; 처리 결과와 오류 메시지를 사용자에게 안내; 팝업/다이얼로그를 열어 추가 입력이나 확인을 처리
- 주요 기능: loader, After Rendering, Exit, 값 변경 반영, Toggle Viewport Toolbar, 기능 실행, success, error, 데이터 새로고침

## 실행 방법

```bash
npm install
npm start
```

<!-- codex-summary:end -->

## 기존 문서

## Application Details
|               |
| ------------- |
|**Generation Date and Time**<br>Mon Jun 08 2026 15:06:48 GMT+0900 (Korean Standard Time)|
|**App Generator**<br>SAP Fiori Application Generator|
|**App Generator Version**<br>1.24.0|
|**Generation Platform**<br>Visual Studio Code|
|**Template Used**<br>Basic V2|
|**Service Type**<br>SAP System (ABAP On-Premise)|
|**Service URL**<br>http://61.97.134.36:8000/sap/opu/odata/sap/ZGWD1MM0006_SRV_01|
|**Module Name**<br>test.inventory|
|**Application Title**<br>App Title|
|**Namespace**<br>test.t1|
|**UI5 Theme**<br>sap_horizon|
|**UI5 Version**<br>1.148.1|
|**Enable TypeScript**<br>False|
|**Add Eslint configuration**<br>True, see https://www.npmjs.com/package/@sap-ux/eslint-plugin-fiori-tools#rules for the eslint rules.|

## test.inventory

An SAP Fiori application.

### Starting the generated app

-   This app has been generated using the SAP Fiori tools - App Generator, as part of the SAP Fiori tools suite.  To launch the generated application, run the following from the generated application root folder:

```
    npm start
```

- It is also possible to run the application using mock data that reflects the OData Service URL supplied during application generation.  In order to run the application with Mock Data, run the following from the generated app root folder:

```
    npm run start-mock
```

#### Pre-requisites:

1. Active NodeJS LTS (Long Term Support) version and associated supported NPM version.  (See https://nodejs.org)
