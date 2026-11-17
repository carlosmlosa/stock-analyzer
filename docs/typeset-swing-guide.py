"""Preserve the supplied guide's layout/figures and typeset its formula blocks.

uv run --no-project --with matplotlib --with reportlab --with pypdf \
  --with pdfplumber python docs/typeset-swing-guide.py

The original is retained under docs/sources. Formula artwork is rendered from
LaTeX-compatible mathtext and composited into the original equation spaces.
"""
from io import BytesIO
import re
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import pdfplumber
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

ROOT=Path(__file__).resolve().parent
SOURCE=ROOT/'sources/Swing_Trading_Indicators_Math_Guide.original.pdf'
OUTPUT=ROOT/'Swing_Trading_Indicators_Math_Guide.pdf'
plt.rcParams.update({'mathtext.fontset':'stix','font.family':'DejaVu Sans'})
# Page number, original line prefix, LaTeX expression. Prose and graphs stay intact.
FORMULAS=[
(3,'Simple return:',r'r_t=\frac{P_t}{P_{t-1}}-1'),
(3,'Log return:',r'g_t=\ln\!\left(\frac{P_t}{P_{t-1}}\right)'),
(3,'Observed price =',r'P_t=T_t+C_t+\varepsilon_t\quad\mathrm{(trend+cycle+noise)}'),
(4,'SMA_n(t)',r'\mathrm{SMA}_{n,t}=\frac{P_t+P_{t-1}+\cdots+P_{t-n+1}}{n}'),
(4,'EMA_t =',r'\mathrm{EMA}_t=\alpha P_t+(1-\alpha)\mathrm{EMA}_{t-1}'),
(4,'alpha =',r'\alpha=\frac{2}{n+1}'),
(6,'Momentum_n(t)',r'M_{n,t}=P_t-P_{t-n}'),
(6,'ROC_n(t)',r'\mathrm{ROC}_{n,t}=\frac{P_t}{P_{t-n}}-1'),
(6,'RS =',r'\mathrm{RS}=\frac{\mathrm{Average\ Gain}}{\mathrm{Average\ Loss}}'),
(6,'RSI =',r'\mathrm{RSI}=100-\frac{100}{1+\mathrm{RS}}'),
(6,'0 <= RSI',r'0\leq\mathrm{RSI}\leq100'),
(8,'MACD_t =',r'\mathrm{MACD}_t=\mathrm{EMA}_{12,t}-\mathrm{EMA}_{26,t}'),
(8,'Signal_t =',r'\mathrm{Signal}_t=\mathrm{EMA}_{9}(\mathrm{MACD})_t'),
(8,'Histogram_t =',r'\mathrm{Histogram}_t=\mathrm{MACD}_t-\mathrm{Signal}_t'),
(8,'Sample variance:',r's^2=\frac{(r_1-\bar r)^2+\cdots+(r_n-\bar r)^2}{n-1}'),
(8,'Sample volatility:',r's=\sqrt{s^2}'),
(8,'Annualized daily volatility',r'\sigma_{\mathrm{annual}}\approx s_{\mathrm{daily}}\sqrt{252}'),
(10,'TR_t =',r'\mathrm{TR}_t=\max\!\left(H_t-L_t,\left|H_t-C_{t-1}\right|,\left|L_t-C_{t-1}\right|\right)'),
(10,'ATR_n =',r'\mathrm{ATR}_{n,t}=\frac{1}{n}\mathrm{TR}_t+\left(1-\frac{1}{n}\right)\mathrm{ATR}_{n,t-1}'),
(10,'Volatility-adjusted stop example:',r'\mathrm{Stop}=\mathrm{Entry}-k\,\mathrm{ATR}'),
(10,'Position size =',r'\mathrm{Position\ size}=\frac{\mathrm{Maximum\ dollar\ risk}}{\mathrm{Stop\ distance}}'),
(11,'Illustrative zone score',r'Z=w_1\,\mathrm{touches}+w_2\,\mathrm{recency}+w_3\,\mathrm{rejection}+w_4\,\mathrm{volume}'),
(11,'Breakout condition (simple):',r'P_t>\mathrm{Recent\ resistance}'),
(12,'Relative Volume (RVOL)',r'\mathrm{RVOL}_t=\frac{nV_t}{V_{t-1}+V_{t-2}+\cdots+V_{t-n}}'),
(12,'Feature vector x =',r'\mathbf{x}=[\mathrm{trend},\mathrm{momentum},\mathrm{volatility},\mathrm{structure},\mathrm{volume},\ldots]'),
(12,'Score =',r'S=w_1x_1+\cdots+w_kx_k=\mathbf{w}^{\mathsf{T}}\mathbf{x}'),
(12,'Classification =',r'\mathrm{Classification}=\mathrm{threshold}(S)'),
(13,'Risk per share =',r'\mathrm{Risk\ per\ share}=\mathrm{Entry}-\mathrm{Stop}\quad\mathrm{(long)}'),
(13,'Potential reward =',r'\mathrm{Potential\ reward}=\mathrm{Target}-\mathrm{Entry}'),
(13,'Reward/Risk ratio =',r'\frac{\mathrm{Reward}}{\mathrm{Risk}}=\frac{\mathrm{Target}-\mathrm{Entry}}{\mathrm{Entry}-\mathrm{Stop}}'),
(14,'Expectancy =',r'\mathbb{E}[X]=p_{\mathrm{win}}\overline{W}-p_{\mathrm{loss}}\overline{L}'),
(14,'Example = 0.40',r'\mathbb{E}[X]=0.40(3R)+0.60(-R)=0.60R'),
(14,'Dollar risk budget =',r'B=\mathrm{Account\ equity}\times\mathrm{Risk\ fraction}'),
(14,'Shares =',r'N_{\mathrm{shares}}=\frac{B}{\mathrm{Entry}-\mathrm{Stop}}'),
(14,'Hypothetical entry =',r'\mathrm{Entry}=\$120'),
(15,'Hypothetical stop =',r'\mathrm{Stop}=\$114\quad\Rightarrow\quad\mathrm{Risk}=\$6/\mathrm{share}\approx1.9\,\mathrm{ATR}'),
(15,'Hypothetical target =',r'\mathrm{Target}=\$138\quad\Rightarrow\quad\mathrm{Reward}=\$18/\mathrm{share}'),
(15,'Reward/Risk =',r'\mathrm{Reward}/\mathrm{Risk}=18/6=3.0'),
]

def artwork(formula):
    fig=plt.figure(figsize=(8,1))
    fig.text(.02,.5,'$'+formula+'$',fontsize=17,va='center',color='#153d35')
    buffer=BytesIO();fig.savefig(buffer,format='png',dpi=300,bbox_inches='tight',pad_inches=.025,transparent=True)
    plt.close(fig);buffer.seek(0);return buffer

reader=PdfReader(SOURCE);writer=PdfWriter(clone_from=reader);converted=0
with pdfplumber.open(SOURCE) as original:
    for number,(page,layout) in enumerate(zip(writer.pages,original.pages),1):
        buffer=BytesIO();overlay=canvas.Canvas(buffer,pagesize=(layout.width,layout.height))
        lines=layout.extract_text_lines()
        for pg,prefix,formula in FORMULAS:
            if pg!=number:continue
            matches=[line for line in lines if line['text'].startswith(prefix)]
            if len(matches)!=1:raise ValueError(f'Expected one equation for page {pg}: {prefix}')
            line=matches[0];top,bottom=line['top']-4,line['bottom']+4
            if prefix=='Illustrative zone score':
                following=[x for x in lines if x['top']>line['top'] and x['text'].startswith('w4*')]
                if len(following)!=1:raise ValueError('Missing zone score continuation')
                bottom=following[0]['bottom']+4
            overlay.setFillColorRGB(1,1,1);overlay.rect(52,layout.height-bottom,508,bottom-top,fill=1,stroke=0)
            img=ImageReader(artwork(formula));width,height=img.getSize()
            scale=min(492/width,(bottom-top-1)/height,1)
            width*=scale;height*=scale
            overlay.drawImage(img,(layout.width-width)/2,layout.height-(top+bottom)/2-height/2,width=width,height=height,mask='auto')
            converted+=1
        if number==15:
            for plain,formula in [
                ('P_t / P_(t-n) - 1',r'P_t/P_{t-n}-1'),
                ('100 - 100/(1+AvgGain/AvgLoss)',r'100-100/(1+\overline{G}/\overline{L})'),
                ('EMA12 - EMA26',r'\mathrm{EMA}_{12}-\mathrm{EMA}_{26}'),
                ('pW*avgW - pL*avgL',r'p_W\overline{W}-p_L\overline{L}')
            ]:
                found=layout.search(re.escape(plain))
                if len(found)!=1:raise ValueError(f'Missing cheat-sheet formula: {plain}')
                box=found[0]; x=box['x0']; y=layout.height-box['bottom']
                overlay.setFillColorRGB(1,1,1);overlay.rect(x-1,y-2,119,box['bottom']-box['top']+4,fill=1,stroke=0)
                img=ImageReader(artwork(formula));width,height=img.getSize()
                scale=min(116/width,11/height)
                overlay.drawImage(img,x,y-1,width=width*scale,height=height*scale,mask='auto')
        overlay.showPage();overlay.save();buffer.seek(0);page.merge_page(PdfReader(buffer).pages[0])
writer.add_metadata({'/Title':'Swing Trading Indicators - Engineering Guide (typeset equations)','/Subject':'Original guide with LaTeX-style mathematical notation'})
with OUTPUT.open('wb') as stream:writer.write(stream)
(ROOT/'swing-indicators-equations.tex').write_text('\\documentclass{article}\n\\usepackage{amsmath,amssymb}\n\\begin{document}\n'+''.join('\\[\n'+formula+'\n\\]\n' for _,_,formula in FORMULAS)+'\\end{document}\n')
assert converted==len(FORMULAS)
print(f'Typeset {converted} equation blocks across {len(reader.pages)} pages: {OUTPUT}')
