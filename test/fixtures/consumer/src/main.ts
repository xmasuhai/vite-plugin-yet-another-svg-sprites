import names, { SvgIconEnum, svgIconIds, type SvgIconName } from 'virtual:svg-sprites'
import onlyNames from 'virtual:svg-sprites/names'
import onlyIds from 'virtual:svg-sprites/ids'

const name: SvgIconName = SvgIconEnum.Add
// @ts-expect-error unknown icon names must be rejected
const invalidName: SvgIconName = 'missing'
const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
const use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
use.setAttribute('href', `#${svgIconIds[0]}`)
svg.append(use)
document.querySelector('#app')?.append(svg)
console.log(name, names, onlyNames, onlyIds, invalidName)