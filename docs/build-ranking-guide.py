"""Build the illustrated guide; authoring-only dependencies, no project install.

uv run --no-project --with matplotlib --with reportlab --with pypdf \
    python docs/build-ranking-guide.py

Equations use Matplotlib's LaTeX-compatible mathtext renderer, not a TeX binary.
The same formula strings are exported as a standalone LaTeX document.
"""
from io import BytesIO
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Image

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'docs/stock-ranking-math.pdf'
LATEX = ROOT / 'docs/stock-ranking-equations.tex'
GREEN, BLUE, ORANGE, INK = '#285944', '#317b9b', '#cb8540', '#253c35'
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':9,'mathtext.fontset':'stix',
                     'axes.spines.top':False,'axes.spines.right':False,
                     'axes.labelcolor':INK,'text.color':INK,'axes.edgecolor':'#b6c8bd',
                     'grid.color':'#dce5df','grid.alpha':.65})
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='BookBody',fontName='Times-Roman',fontSize=11.5,leading=15.5,spaceAfter=10,textColor=colors.HexColor(INK)))
styles.add(ParagraphStyle(name='Caption',fontName='Helvetica',fontSize=8.5,leading=11.5,spaceAfter=12,textColor=colors.HexColor('#53695d')))
styles['Title'].fontSize=23; styles['Title'].leading=28; styles['Title'].textColor=colors.HexColor(GREEN)
styles['Heading2'].textColor=colors.HexColor(GREEN); styles['Heading2'].fontSize=13
story, equations = [], []

def p(text): story.append(Paragraph(text,styles['BookBody']))
def h(text): story.append(Paragraph(text,styles['Heading2']))
def caption(text): story.append(Paragraph(text,styles['Caption']))
def page(title):
    if story: story.append(PageBreak())
    story.append(Paragraph(title,styles['Title'])); story.append(Spacer(1,10))
def picture(fig,width=510):
    buffer=BytesIO(); fig.savefig(buffer,format='png',dpi=240,bbox_inches='tight',facecolor='white'); plt.close(fig)
    buffer.seek(0); image=Image(buffer); image.drawHeight=width*image.imageHeight/image.imageWidth; image.drawWidth=width
    story.append(image); story.append(Spacer(1,8))
def eq(*lines):
    equations.extend(lines)
    # Keep a fixed physical canvas so short equations are not enlarged to page width.
    fig=plt.figure(figsize=(7.1,.62*len(lines)))
    for i,line in enumerate(lines):
        text=fig.text(.02,1-(i+.5)/len(lines),'$'+line+'$',fontsize=16,va='center')
        fig.canvas.draw()
        extent=text.get_window_extent(fig.canvas.get_renderer())
        if extent.width > fig.bbox.width*.95:
            text.set_fontsize(16*fig.bbox.width*.95/extent.width)
    buffer=BytesIO(); fig.savefig(buffer,format='png',dpi=280,facecolor='white'); plt.close(fig)
    buffer.seek(0); image=Image(buffer); image.drawWidth=500
    image.drawHeight=500*image.imageHeight/image.imageWidth
    story.append(image); story.append(Spacer(1,8))

def axes_style(ax): ax.grid(True,linewidth=.5); ax.set_axisbelow(True)

# Deterministic teaching signal, never a downloaded stock or backtest.
rng=np.random.default_rng(7)
t=np.arange(320)
close=100*np.exp(.0014*t+.025*np.sin(t/15)+np.cumsum(rng.normal(0,.005,len(t))))
high=close+1.6; low=close-1.4
close[280:]+=5; high[280:]+=5; low[280:]+=5
volume=1e6*(1+.15*np.sin(t/8)); volume[280]=1.8e6

def sma(x,n): return np.r_[np.full(n-1,np.nan),np.convolve(x,np.ones(n)/n,'valid')]
tr=np.maximum.reduce([high-low,np.abs(high-np.r_[close[0],close[:-1]]),np.abs(low-np.r_[close[0],close[:-1]])])
atr=np.full(len(t),np.nan); atr[13]=np.mean(tr[:14])
for i in range(14,len(t)): atr[i]=atr[i-1]+(tr[i]-atr[i-1])/14
prior_high=np.array([np.max(high[i-20:i]) if i>=20 else np.nan for i in t])
distance=(close-prior_high)/atr

page('Stock rankings\nA signal-processing perspective')
caption('SIGNAL LAB  /  ILLUSTRATED MATHEMATICAL GUIDE  /  VERSION 1')
p('The system produces up to ten growth-momentum candidates and ten swing-watchlist candidates from saved daily OHLCV. This guide follows the implemented formulas, using typeset LaTeX notation and deterministic synthetic illustrations. The weights are heuristic; no backtested performance is claimed.')
h('1. Samples and processing chain')
p('Let C<sub>t</sub>, H<sub>t</sub>, L<sub>t</sub>, and V<sub>t</sub> denote adjusted Close, High, Low, and share volume for trading session t. One sample is one observed session, not one calendar day. A 252-session lag approximates a trading year.')
fig,ax=plt.subplots(figsize=(7.1,1.5));ax.axis('off')
for i,label in enumerate(['Daily\nOHLCV','Validate &\nfilter','Causal\nfeatures','Percentile\nscores','Top 10\nper screen']):
    x=.095+i*.20
    ax.text(x,.55,label,ha='center',va='center',bbox=dict(boxstyle='round,pad=.6',fc='#eff5ef',ec=GREEN),fontsize=9)
    if i<4: ax.annotate('',xy=(x+.135,.55),xytext=(x+.065,.55),arrowprops=dict(arrowstyle='->',color=GREEN))
picture(fig);caption('Figure 1. Two gates precede ranking: data/liquidity eligibility, then the screen-specific trading conditions.')
p('Require 253 aligned daily bars, unique ascending dates, finite numeric OHLCV, positive prices, nonnegative volume, and Low &le; Close &le; High. Missing or misaligned rows are rejected; no interpolation is performed. Files above the parser limit of 10,000 rows are rejected.')
eq(r'\overline{\mathcal{V}}_{20,t}=\frac{1}{20}\sum_{k=0}^{19} C_{t-k}V_{t-k}\ \geq\ 10^6')
p('This average dollar-volume gate is an approximate liquidity filter. Only files ending on the latest successfully parsed endpoint are compared. That endpoint can itself be old or incomplete; historical calendar gaps are not diagnosed. The page displays dates and exclusions.')
p('Growth is a price-momentum proxy without business fundamentals. Swing is a watchlist, not an entry/exit system. Lists may overlap, contain fewer than ten names, or concentrate in one sector. Daily scores and the hourly High explorer use different observables.')

page('Moving averages as causal FIR filters')
h('2. The trend baseline')
eq(r'M_{N,t}=\frac{1}{N}\sum_{k=0}^{N-1}C_{t-k}',r'H_N(z)=\frac{1}{N}\sum_{k=0}^{N-1}z^{-k},\qquad \tau_g=\frac{N-1}{2}')
p('The simple moving average is a causal low-pass FIR filter. SMA50 and SMA200 have linear-phase group delays of 24.5 and 99.5 samples, respectively (away from response zeros). Longer windows suppress rapid variation but respond more slowly. Centered smoothers are not used in these scores.')
fig,(a,b)=plt.subplots(2,1,figsize=(7.1,3.7),layout='constrained')
a.plot(t,close,color='#91a49b',label='Synthetic Close',lw=1)
for n,col in [(50,GREEN),(200,BLUE)]: a.plot(t,sma(close,n),label=f'SMA{n}',color=col,lw=1.7)
a.set(xlabel='Trading-session sample',ylabel='Price (arbitrary units)');a.legend(loc='upper left',fontsize=8);axes_style(a)
f=np.linspace(0,.08,1800)
for n,col in [(50,GREEN),(200,BLUE)]:
    magnitude=np.abs(np.sinc(n*f)/np.sinc(f));b.plot(f,20*np.log10(np.maximum(magnitude,1e-5)),color=col,label=f'N={n}')
b.set(xlabel='Frequency (cycles per session)',ylabel='Magnitude (dB)',ylim=(-65,2));b.legend(fontsize=8);axes_style(b)
picture(fig);caption('Figure 2. Synthetic trend filtering (top) and analytic FIR magnitude responses (bottom). The first null occurs at 1/N cycles per session. Plotted dB values are floored for display only.')
p('The growth gate checks C<sub>t</sub> &gt; M<sub>50,t</sub> &gt; M<sub>200,t</sub>. This compares a signal with two delayed baselines; it does not explicitly test whether either moving average has positive slope. Sideways markets can produce repeated false crossings.')

page('Momentum as a log-price difference')
h('3. Remove the level; retain accumulated drift')
eq(r'R_{k,t}=\frac{C_t}{C_{t-k}}-1',r'\log(1+R_{k,t})=\log C_t-\log C_{t-k}',r'H_{\Delta,k}(z)=1-z^{-k},\qquad T_t=\frac{C_t}{M_{200,t}}-1')
p('Momentum is a finite difference in log-price coordinates. It eliminates a constant level and measures accumulated drift over k samples, but also responds to shocks. The implementation uses simple returns R<sub>20</sub>, R<sub>126</sub>, and R<sub>252</sub>; the log identity explains their signal-processing interpretation.')
fig,ax=plt.subplots(figsize=(7.1,2.8));ax.plot(t,close,color=GREEN,lw=1.5)
end=len(t)-1
for k,col,offset in [(20,ORANGE,0),(126,BLUE,14),(252,'#8d6ba5',28)]:
    start=end-k; ax.scatter([start,end],[close[start],close[end]],color=col,s=22,zorder=4)
    y=max(close)+8+offset;ax.annotate('',xy=(end,y),xytext=(start,y),arrowprops=dict(arrowstyle='<->',color=col))
    ax.text((start+end)/2,y+2,f'{k} sessions: {100*(close[end]/close[start]-1):.1f}%',ha='center',fontsize=8,color=col)
ax.set(xlabel='Trading-session sample',ylabel='Synthetic price',ylim=(min(close)-5,max(close)+45));axes_style(ax)
picture(fig);caption('Figure 3. All horizons end at the same observation. Different start points measure different portions of the same synthetic path. No future sample enters the calculation.')
p('The horizons overlap, so they are correlated features rather than independent confirmations. Distance above SMA200, T<sub>t</sub>, adds another trend-strength feature but is also correlated with returns. Percentile normalization later puts these measurements on a common scale without removing that correlation.')
p('A 252-session return uses C<sub>t-252</sub>, hence the minimum of 253 closes. Momentum is not a valuation model or an estimate of earnings growth.')

page('Volatility and ATR: two risk observables')
h('4. Return dispersion')
eq(r'r_j=\log\!\left(\frac{C_j}{C_{j-1}}\right),\qquad \bar r_t=\frac{1}{63}\sum_{k=0}^{62}r_{t-k}',r'\sigma_t=\sqrt{\frac{252}{62}\sum_{k=0}^{62}(r_{t-k}-\bar r_t)^2}')
p('The last 64 closes yield 63 log returns. Sample variance uses 62 degrees of freedom. Multiplication by 252 annualizes variance under a conventional stationary, weakly correlated return approximation. Dispersion includes both gains and losses; it is not a complete measure of downside risk.')
h('5. Range envelope and a one-pole IIR')
eq(r'\mathrm{TR}_t=\max\!\left(H_t-L_t,\ |H_t-C_{t-1}|,\ |L_t-C_{t-1}|\right)',r'A_t=A_{t-1}+\frac{1}{14}(\mathrm{TR}_t-A_{t-1})',r'H_A(z)=\frac{\alpha}{1-(1-\alpha)z^{-1}},\qquad \alpha=\frac{1}{14}')
p('A<sub>t</sub> denotes ATR14. The first true range is H<sub>0</sub>-L<sub>0</sub>; ATR is seeded with the mean of the first 14 true ranges. After initialization, the pole is 13/14, with time constant -1/log(13/14), approximately 13.5 samples. ATR measures range in price units, not direction.')
fig,ax=plt.subplots(figsize=(7.1,1.65));sel=slice(255,310)
ax.plot(t[sel],tr[sel],color=ORANGE,label='True range');ax.plot(t[sel],atr[sel],color=GREEN,label='ATR14',lw=2)
ax.axvline(280,color=BLUE,ls=':',lw=1);ax.set(xlabel='Trading-session sample',ylabel='Price units');ax.legend(fontsize=8);axes_style(ax)
picture(fig);caption('Figure 4. An inserted upward price gap increases true range; the ATR envelope then relaxes gradually. Synthetic example, not a market observation.')

page('Growth: gate, normalize, combine')
h('6. Eligibility before scoring')
eq(r'C_t>M_{50,t}>M_{200,t},\qquad R_{252,t}>0')
p('Apply the shared data and liquidity gates first. A stock must then have a positive 252-session return and ordered Close/SMA baselines. Only stocks passing this screen define the peer set for its percentiles.')
h('7. Cross-sectional midrank percentiles')
eq(r'P(x)=\frac{L(x)+\frac{E(x)-1}{2}}{n-1}\quad (n>1)',r'L(x)=\sum_{i=1}^{n}\mathbf{1}(x_i<x),\qquad E(x)=\sum_{i=1}^{n}\mathbf{1}(x_i=x)',r'P(x)=\frac{1}{2}\quad (n=1)')
p('L counts peers strictly below x; E counts equal values, including the stock itself. Ties share a midrank. A singleton receives 0.5 because no relative comparison is possible. Percentiles resist domination by extreme magnitudes, but discard how far apart observations are.')
h('8. A weighted preference, not a prediction')
eq(r'G=100\left[0.40P(R_{252})+0.30P(R_{126})\right.',r'\left.\qquad\quad +0.20P(T)+0.10P(-\sigma)\right]')
p('Negating volatility gives lower dispersion a higher percentile. The score is a convex combination on a 0-100 scale, apart from floating-point roundoff. Sort descending and retain up to ten candidates; ticker order resolves equal final scores reproducibly.')
p('The coefficients express a preference for persistent momentum. They were hand-selected, not fitted or backtested. A high score can still correspond to losses. Score levels also change as the eligible universe changes.')

page('How a score of 80 is assembled')
h('9. A worked cross-sectional example')
eq(r'(P(R_{252}),P(R_{126}),P(T),P(-\sigma))=(0.90,0.80,0.70,0.60)',r'G=100(0.40\cdot0.90+0.30\cdot0.80+0.20\cdot0.70+0.10\cdot0.60)=80')
fig,(a,b)=plt.subplots(2,1,figsize=(7.1,3.7),layout='constrained')
values=np.array([.05,.10,.10,.18,.30]);ranks=[(np.sum(values<x)+(np.sum(values==x)-1)/2)/(len(values)-1) for x in values]
a.scatter(values,100*np.array(ranks),s=60,color=GREEN)
for x,y in sorted(set(zip(values,ranks))): a.annotate(f'{100*y:.1f}%',(x,100*y),xytext=(5,7),textcoords='offset points',fontsize=8)
a.set(xlabel='Hypothetical raw return',ylabel='Midrank percentile (%)',ylim=(-10,115));axes_style(a)
labels=['252-session momentum','126-session momentum','Trend separation','Low volatility'];contributions=[36,24,14,6];left=0
for label,value,col in zip(labels,contributions,[GREEN,BLUE,ORANGE,'#8d6ba5']):
    b.barh(['Growth score'],[value],left=left,color=col,label=label,height=.45);b.text(left+value/2,0,str(value),ha='center',va='center',color='white',fontweight='bold');left+=value
b.set(xlim=(0,100),xlabel='Weighted score points');b.legend(loc='upper center',bbox_to_anchor=(.5,-.35),ncol=2,fontsize=8);axes_style(b)
picture(fig);caption('Figure 5. Top: equal raw values receive the same midrank (the two 10% observations coincide at 37.5%). Bottom: 36 + 24 + 14 + 6 points produce a growth score of 80. All values are hypothetical.')
p('An 80 is neither an 80% probability of a price rise nor an 80% expected return. A percentile expresses standing within one screen, not against the whole market. Growth and swing use different peer sets and features, so their numeric scores are not directly interchangeable.')
p('Percentiles are invariant to strictly increasing transformations. Small raw changes can still cause rank changes, particularly among tightly clustered peers. Inspect the displayed raw metrics alongside the score.')

page('Swing: normalize a breakout in ATR units')
h('10. Compare with the preceding range')
eq(r'B_t=\max_{1\leq k\leq20}H_{t-k}',r'D_t=\frac{C_t-B_t}{A_t},\qquad Q_t=\frac{V_t}{\frac{1}{20}\sum_{k=1}^{20}V_{t-k}}')
p('B is a nonlinear sliding maximum of the previous 20 highs. Today is excluded from the maximum and the volume baseline. D measures distance in ATR units; Q is relative volume. Unlike dollar distances, D can be compared across differently priced stocks.')
h('11. Gate and score')
eq(r'C_t>M_{50,t},\qquad R_{20,t}>0,\qquad -1\leq D_t\leq2',r'S=100\left[0.40P(R_{20})+0.35P(D)+0.25P(Q)\right]')
p('The gate admits candidates from one ATR below to two ATR above the prior high. Within that interval the score favors stronger short momentum, greater breakout position, and higher relative volume. Volume above its baseline is rewarded, not required. All percentiles are recomputed within the swing screen.')
fig,ax=plt.subplots(figsize=(7.1,1.6));ax.axvspan(-1,0,color='#e6eef4');ax.axvspan(0,2,color='#e4f0e6');ax.axvline(0,color=GREEN,lw=1.5)
ax.plot([-.5], [.5],'o',color=BLUE);ax.text(-.5,.72,'Approaching high',ha='center',fontsize=8)
ax.plot([1], [.5],'o',color=ORANGE);ax.text(1,.72,'Above prior high',ha='center',fontsize=8)
ax.set(xlim=(-2,3),ylim=(0,1),yticks=[],xlabel=r'Breakout distance $D_t$ (ATR units)');ax.set_xticks([-2,-1,0,1,2,3]);ax.spines['left'].set_visible(False)
picture(fig);caption('Figure 6. The shaded interval is the proximity gate. Other eligibility conditions must also hold. A negative distance is a watchlist setup, not a confirmed breakout.')
p('The cutoff at two ATR limits extreme extension but is a heuristic. There is no RSI, MACD, price target, stop, automatic order, or holding-period rule in this version. ATR-based position sizing would require a separate trade-management design.')

page('Reading the swing features on a chart')
h('12. A synthetic gap and volume confirmation')
fig,(a,b,c)=plt.subplots(3,1,figsize=(7.1,5),sharex=True,layout='constrained',gridspec_kw={'height_ratios':[1.5,1,1]})
sel=slice(255,305);x=t[sel]
a.plot(x,close[sel],color=GREEN,label='Close',lw=1.8);a.plot(x,prior_high[sel],color=BLUE,label='Prior 20-session high',ls='--')
a.set(ylabel='Synthetic price');a.legend(fontsize=8,loc='upper left');axes_style(a)
b.axhspan(-1,2,color='#e4f0e6');b.plot(x,distance[sel],color=ORANGE);b.axhline(0,color=BLUE,lw=.8);b.set(ylabel='Distance / ATR');axes_style(b)
q=np.array([volume[i]/np.mean(volume[i-20:i]) if i>=20 else np.nan for i in t])
c.bar(x,q[sel],color=BLUE,width=.8);c.axhline(1,color=ORANGE,ls='--');c.set(ylabel='Relative volume',xlabel='Trading-session sample');axes_style(c)
for ax in (a,b,c): ax.axvline(280,color='#8d6ba5',ls=':',lw=1)
picture(fig);caption('Figure 7. A deliberately inserted gap at sample 280 moves Close above the prior high and produces a relative-volume spike. The reference high excludes the current bar, then updates causally on subsequent sessions. Shading shows only the distance gate, not full swing eligibility.')
p('ATR changes when the gap arrives, so the denominator is adaptive. A low ATR makes a given dollar move larger in normalized units. The rolling maximum can remain elevated after a spike, making later observations sit below resistance even when their short-term momentum remains positive.')
p('Evaluate after a completed regular session. An incomplete bar can distort volume, Close, and ATR. The app reads saved data without downloading anything. Its market-update button refreshes hourly files only; daily files must be refreshed explicitly.')

page('Limits, validation, and references')
h('13. What remains unproven')
p('This pipeline measures saved patterns, not guaranteed persistence. Momentum can reverse abruptly. ATR and recent volatility do not bound future losses. No sector cap, portfolio optimization, benchmark-relative return, or risk-free-rate adjustment is included. Missing files change the peer universe.')
p('This is not an implementation of an MSCI index. MSCI provides institutional context for multi-horizon momentum and risk; our gates, percentile normalization, features, and weights are different.')
h('14. A defensible next experiment')
p('Freeze the rules first. At each historical decision date, use only information then available and enter no earlier than the next tradable bar. Use historical membership to avoid survivorship bias; testing only today\'s constituents creates a biased historical sample. Respect corporate-action and fundamental-data availability.')
p('Specify holding periods and exits before testing: monthly rebalancing could be a growth baseline; swing needs a separate policy. Include spreads, slippage, commissions, and turnover. Compare against a broad-market benchmark and simpler momentum screens. Use chronological holdout or walk-forward evaluation, with care for overlapping forward returns.')
p('Report annualized return, volatility, maximum drawdown, turnover, and market-regime results. Check sensitivity to nearby horizons and weights rather than selecting one attractive optimum. No such performance test has been run for this version.')
h('References')
p('Fidelity, <i>Technical Analysis Indicator Guide</i>: moving averages and momentum indicators.<br/><link href="https://www.fidelity.com/learning-center/trading-investing/technical-analysis" color="#285944">fidelity.com/learning-center/trading-investing/technical-analysis</link>')
p('Fidelity, <i>Average True Range</i>: range-based volatility and gap handling.<br/><link href="https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/atr" color="#285944">Fidelity ATR indicator guide</link>')
p('MSCI, <i>Momentum Indexes</i>: context for risk-adjusted momentum.<br/><link href="https://www.msci.com/indexes/group/momentum-indexes" color="#285944">msci.com/indexes/group/momentum-indexes</link>')
h('Reproducible sources')
p('Implementation: playground/recommender.js. Tests: playground/recommender.test.js. Guide source: docs/build-ranking-guide.py. LaTeX equations: docs/stock-ranking-equations.tex. Figures use deterministic synthetic data, never real market prices or strategy returns.')
caption('Equations are rendered with Matplotlib\'s LaTeX-compatible mathtext engine. The exported .tex document can be compiled separately with a LaTeX distribution and amsmath. Matplotlib, NumPy, and ReportLab are authoring dependencies, not application requirements.')

def footer(canvas,doc):
    canvas.setStrokeColor(colors.HexColor('#d9e2d7'));canvas.line(44,40,568,40)
    canvas.setFont('Helvetica',8);canvas.setFillColor(colors.HexColor('#52645c'))
    canvas.drawString(44,27,'SIGNAL LAB  /  Mathematical guide  /  Synthetic illustrations')
    canvas.drawRightString(568,27,str(doc.page))
OUTPUT.parent.mkdir(parents=True,exist_ok=True)
SimpleDocTemplate(str(OUTPUT),pagesize=(612,792),rightMargin=44,leftMargin=44,topMargin=38,bottomMargin=56,title='Signal Lab: Illustrated stock ranking mathematics',author='Signal Lab').build(story,onFirstPage=footer,onLaterPages=footer)
LATEX.write_text('\\documentclass{article}\n\\usepackage{amsmath,amssymb}\n\\begin{document}\n\\section*{Signal Lab: ranking equations}\n'+''.join('\\begin{equation}\n'+line+'\n\\end{equation}\n' for line in equations)+'\\end{document}\n')
print(OUTPUT)
print(LATEX)
