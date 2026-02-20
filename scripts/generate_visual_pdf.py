from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch
from matplotlib import font_manager


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "04_visual_summary.pdf"


def setup_font():
    candidates = [
        Path(r"C:\Windows\Fonts\YuGothM.ttc"),
        Path(r"C:\Windows\Fonts\meiryo.ttc"),
    ]
    for p in candidates:
        if p.exists():
            font_manager.fontManager.addfont(str(p))
            prop = font_manager.FontProperties(fname=str(p))
            plt.rcParams["font.family"] = prop.get_name()
            return


def rounded_box(ax, x, y, w, h, title, body="", fc="#ffffff", ec="#b8cce3"):
    patch = FancyBboxPatch(
        (x, y),
        w,
        h,
        boxstyle="round,pad=0.01,rounding_size=0.02",
        facecolor=fc,
        edgecolor=ec,
        linewidth=1.2,
    )
    ax.add_patch(patch)
    ax.text(x + w / 2, y + h * 0.65, title, ha="center", va="center", fontsize=12, color="#194d7f")
    if body:
        ax.text(x + w / 2, y + h * 0.35, body, ha="center", va="center", fontsize=9, color="#4d6783")


def add_arrow(ax, x1, y1, x2, y2):
    ax.add_patch(
        FancyArrowPatch(
            (x1, y1),
            (x2, y2),
            arrowstyle="-|>",
            mutation_scale=12,
            linewidth=1.2,
            color="#7a93ad",
        )
    )


def page1(pdf):
    fig = plt.figure(figsize=(8.27, 11.69))
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_axis_off()
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)

    rounded_box(ax, 0.08, 0.83, 0.84, 0.12, "シフト集約システム 統合サマリー", "要件定義 + ER図 + API一覧", fc="#edf5ff")
    ax.text(0.1, 0.78, "目的: 社員の月次希望を1回で回収し、社長のGoogleスプレッドシートへ自動同期", fontsize=10, color="#415a75")

    rounded_box(ax, 0.08, 0.65, 0.25, 0.1, "入力回数", "1社員×1月=1回", fc="#f8fbff")
    rounded_box(ax, 0.375, 0.65, 0.25, 0.1, "認証", "Google OAuth", fc="#f8fbff")
    rounded_box(ax, 0.67, 0.65, 0.25, 0.1, "連携", "Google Sheets", fc="#f8fbff")

    rounded_box(ax, 0.08, 0.46, 0.2, 0.1, "社員", "希望入力")
    rounded_box(ax, 0.4, 0.43, 0.2, 0.16, "システム", "保存・重複防止・同期")
    rounded_box(ax, 0.72, 0.46, 0.2, 0.1, "管理者", "集約確認")
    add_arrow(ax, 0.28, 0.51, 0.4, 0.51)
    add_arrow(ax, 0.6, 0.51, 0.72, 0.51)

    ax.text(0.08, 0.35, "主要機能", fontsize=13, color="#103a66", weight="bold")
    bullets = [
        "1. 社員向け: 対象月のシフト希望提出（プルダウン選択）",
        "2. 管理者向け: 月次集約、未提出確認、社員マスタ管理",
        "3. システム: 認証、DB保存、スプレッドシート同期、監査ログ",
    ]
    y = 0.31
    for b in bullets:
        ax.text(0.1, y, b, fontsize=10, color="#334a61")
        y -= 0.04

    ax.text(0.08, 0.06, "1 / 3", fontsize=9, color="#6a7d91")
    pdf.savefig(fig)
    plt.close(fig)


def page2(pdf):
    fig = plt.figure(figsize=(8.27, 11.69))
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_axis_off()
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)

    ax.text(0.08, 0.94, "画面遷移とER図", fontsize=18, color="#103a66", weight="bold")

    steps = ["S01\nログイン", "S03\n月選択/入力", "S03\n日別希望", "S04\n提出完了", "S05\n提出済み"]
    x = 0.08
    for i, s in enumerate(steps):
        rounded_box(ax, x, 0.8, 0.15, 0.09, s, fc="#f7fbff")
        if i < len(steps) - 1:
            add_arrow(ax, x + 0.15, 0.845, x + 0.18, 0.845)
        x += 0.18
    ax.text(0.08, 0.75, "管理者導線: A01ダッシュボード → A02集約一覧 / A03未提出 / A04社員マスタ / A05同期履歴", fontsize=9.5, color="#4a647f")

    ax.text(0.08, 0.69, "ERサマリー", fontsize=13, color="#103a66", weight="bold")
    rounded_box(ax, 0.08, 0.56, 0.18, 0.08, "users", "Google主体")
    rounded_box(ax, 0.3, 0.56, 0.18, 0.08, "employees", "社員マスタ")
    rounded_box(ax, 0.52, 0.56, 0.18, 0.08, "shift_months", "対象月")

    rounded_box(ax, 0.25, 0.4, 0.36, 0.1, "shift_submissions", "UNIQUE(employee_id, shift_month_id)", fc="#eefaf5", ec="#85c5ae")
    rounded_box(ax, 0.25, 0.26, 0.23, 0.08, "shift_submission_details", "日別希望")
    rounded_box(ax, 0.53, 0.26, 0.22, 0.08, "sync_jobs/items", "同期履歴")
    rounded_box(ax, 0.08, 0.26, 0.14, 0.08, "audit_logs", "操作証跡")

    add_arrow(ax, 0.17, 0.56, 0.33, 0.5)
    add_arrow(ax, 0.39, 0.56, 0.43, 0.5)
    add_arrow(ax, 0.61, 0.56, 0.54, 0.5)
    add_arrow(ax, 0.43, 0.4, 0.36, 0.34)
    add_arrow(ax, 0.55, 0.4, 0.62, 0.34)
    add_arrow(ax, 0.3, 0.4, 0.17, 0.34)

    rows = [
        ("users", "google_sub, email を一意管理"),
        ("employees", "在籍・無効化を管理（論理削除）"),
        ("shift_submissions", "同一社員・同一月の重複提出をDBで防止"),
        ("sync_jobs", "自動/手動/再試行の実行結果を記録"),
    ]
    y = 0.18
    for name, desc in rows:
        ax.text(0.08, y, f"- {name}: {desc}", fontsize=9.5, color="#334a61")
        y -= 0.03

    ax.text(0.08, 0.06, "2 / 3", fontsize=9, color="#6a7d91")
    pdf.savefig(fig)
    plt.close(fig)


def page3(pdf):
    fig = plt.figure(figsize=(8.27, 11.69))
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_axis_off()
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)

    ax.text(0.08, 0.94, "API一覧と連携イメージ", fontsize=18, color="#103a66", weight="bold")

    groups = [
        ("認証", ["GET /auth/google", "GET /auth/google/callback", "GET /me"]),
        ("社員提出", ["GET /shift-months/open", "GET /employees/active", "POST /shift-submissions"]),
        ("管理者", ["GET /admin/shift-submissions/:yearMonth", "GET /admin/unsubmitted/:yearMonth", "PATCH /admin/shift-submissions/:id"]),
        ("同期・監査", ["POST /admin/sync-jobs", "POST /admin/sync-jobs/:id/retry", "GET /admin/audit-logs"]),
    ]
    y = 0.84
    for title, items in groups:
        rounded_box(ax, 0.08, y - 0.08, 0.46, 0.11, title, "\n".join(items), fc="#f8fbff")
        y -= 0.14

    rounded_box(ax, 0.62, 0.76, 0.22, 0.08, "社員UI", "提出API")
    rounded_box(ax, 0.62, 0.62, 0.22, 0.08, "アプリAPI", "検証/保存/同期起動", fc="#eefaf5", ec="#85c5ae")
    rounded_box(ax, 0.62, 0.48, 0.22, 0.08, "DB", "提出・監査ログ")
    rounded_box(ax, 0.62, 0.34, 0.22, 0.08, "Google Sheets", "自動同期")
    rounded_box(ax, 0.62, 0.2, 0.22, 0.08, "管理者UI", "集約確認")
    add_arrow(ax, 0.73, 0.76, 0.73, 0.7)
    add_arrow(ax, 0.73, 0.62, 0.73, 0.56)
    add_arrow(ax, 0.73, 0.48, 0.73, 0.42)
    add_arrow(ax, 0.73, 0.34, 0.73, 0.28)

    ax.text(0.08, 0.17, "受け入れ判定の要点", fontsize=13, color="#103a66", weight="bold")
    checks = [
        "1. 同一社員・同一月の2回目提出は 409 を返す",
        "2. 社員プルダウンは employees マスタから生成される",
        "3. 提出後に管理者スプレッドシートへ同期される",
        "4. 未提出一覧と同期失敗履歴を管理者が確認できる",
    ]
    y = 0.13
    for c in checks:
        ax.text(0.1, y, c, fontsize=9.8, color="#334a61")
        y -= 0.03

    ax.text(0.08, 0.06, "3 / 3", fontsize=9, color="#6a7d91")
    pdf.savefig(fig)
    plt.close(fig)


def main():
    setup_font()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with PdfPages(OUT) as pdf:
        page1(pdf)
        page2(pdf)
        page3(pdf)
    print(f"generated: {OUT}")


if __name__ == "__main__":
    main()
