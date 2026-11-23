from pathlib import Path
from PIL import Image, ImageDraw

folder = Path('public/icons')
folder.mkdir(parents=True,exist_ok=True)
for size,filename in [(192,'icon-192.png'),(512,'icon-512.png'),(180,'apple-touch-icon.png')]:
    image = Image.new('RGB',(size,size),'#101416')
    draw = ImageDraw.Draw(image)
    def box(*values):
        return tuple(round(value*size) for value in values)
    draw.rounded_rectangle(box(.19,.19,.81,.81),radius=round(.15*size),fill='#ffd24b')
    draw.polygon([box(.31,.54),box(.37,.39),box(.63,.39),box(.69,.54)],fill='#162021')
    draw.rounded_rectangle(box(.29,.50,.71,.66),radius=round(.04*size),fill='#162021')
    draw.rounded_rectangle(box(.32,.60,.385,.70),radius=round(.025*size),fill='#162021')
    draw.rounded_rectangle(box(.615,.60,.68,.70),radius=round(.025*size),fill='#162021')
    draw.polygon([box(.37,.50),box(.402,.426),box(.598,.426),box(.63,.50)],fill='#ffd24b')
    draw.ellipse(box(.325,.55,.39,.61),fill='#ffd24b')
    draw.ellipse(box(.61,.55,.675,.61),fill='#ffd24b')
    draw.rounded_rectangle(box(.445,.325,.555,.372),radius=round(.012*size),fill='#162021')
    image.save(folder/filename)
